"use strict";

/**
 * Class Touch
 * Handles all touch input for mobile devices including virtual joystick and action buttons
 */
const Touch = function () {

    // Check if touch is supported
    this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // Mobile mode flag
    this.isMobileMode = false;

    // Joystick state
    this.joystick = {
        active: false,
        touchIdentifier: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        direction: null,
        animationFrame: null
    };

    // Long press detection
    this.longPressTimer = null;
    this.longPressTriggered = false;

    // Tap detection for double tap
    this.lastTapTime = 0;
    this.lastTapTarget = null;

    // Double-tap detection on the game world. Tile identity is used instead of
    // raw pixels so both taps may land anywhere inside the same SQM.
    this.lastCanvasTapTime = 0;
    this.lastCanvasTapTile = null;
    this.pendingCanvasWalkTimer = null;
    this.canvasTapHighlight = null;
    this.canvasTapHighlightTimer = null;

    // One-finger item drag state. A small movement threshold keeps ordinary
    // taps available for walking, looking and using objects.
    this.itemDrag = null;

    // Long-press positioning for the four action buttons and the complete
    // mobile hotbar. This manager also prevents a drag gesture from firing the
    // control's normal tap action.
    this.controlLayout = new MobileControlLayout();

    // Mobile keyboard layout is bound once even when __initialize() runs again
    // after rotating or resizing the device.
    this.__mobileChatViewportBound = false;
    this.__mobileChatInputFocused = false;
    this.__mobileChatBlurPending = false;
    this.__mobileChatViewportTimers = new Array();

    // Initialize if on mobile or landscape
    if (this.isTouchDevice || window.innerWidth <= 768 || window.innerHeight <= 500) {
        this.__initialize();
    }

    // Listen for resize to toggle mobile mode
    window.addEventListener('resize', this.__handleResize.bind(this));

}

Touch.prototype.JOYSTICK_DEADZONE = 15;
Touch.prototype.LONG_PRESS_DURATION = 500; // ms for long press
Touch.prototype.CANVAS_DOUBLE_TAP_INTERVAL = 350;
Touch.prototype.CANVAS_WALK_DELAY = 380;
Touch.prototype.CANVAS_TAP_HIGHLIGHT_DURATION = 520;

Touch.prototype.__initialize = function () {

    /*
     * Function Touch.__initialize
     * Initialize touch controls and event listeners
     */

    this.isMobileMode = true;

    // Get DOM elements
    this.joystickZone = document.getElementById('mobile-joystick-zone');
    this.joystickKnob = document.getElementById('joystick-knob');
    this.virtualJoystick = document.getElementById('virtual-joystick');

    // Action buttons
    this.attackBtn = document.getElementById('mobile-attack-btn');
    this.menuBtn = document.getElementById('mobile-menu-btn');
    this.inventoryBtn = document.getElementById('mobile-inventory-btn');
    this.equipmentBtn = document.getElementById('mobile-equipment-btn');
    this.chatBtn = document.getElementById('mobile-chat-btn');
    // Reuse the original chat header on touch devices. These controls have
    // existed since the first client version, so an installed PWA cannot end
    // up with fresh CSS hiding them while waiting for a newer HTML document.
    this.chatExpandBtn = document.getElementById('chat-lock-resize');
    this.leftChannelBtn = document.getElementById('left-channel');
    this.rightChannelBtn = document.getElementById('right-channel');
    this.openChatBtn = document.getElementById('open-chat-modal');
    this.__prepareMobileChat();
    this.__bindMobileChatViewport();
    this.__updateChatExpandButton(false);

    // Status bars
    this.healthBar = document.getElementById('mobile-health-bar');
    this.healthText = document.getElementById('mobile-health-text');
    this.manaBar = document.getElementById('mobile-mana-bar');
    this.manaText = document.getElementById('mobile-mana-text');

    // Bind joystick events
    if (this.joystickZone) {
        this.joystickZone.addEventListener('touchstart', this.__handleJoystickStart.bind(this), { passive: false });
        this.joystickZone.addEventListener('touchmove', this.__handleJoystickMove.bind(this), { passive: false });
        this.joystickZone.addEventListener('touchend', this.__handleJoystickEnd.bind(this), { passive: false });
        this.joystickZone.addEventListener('touchcancel', this.__handleJoystickEnd.bind(this), { passive: false });
    }

    // The four movable action buttons execute on touch release. This leaves a
    // 500 ms hold window in which the layout manager can safely start dragging
    // without opening a window or triggering combat first.
    if (this.menuBtn) {
        this.menuBtn.addEventListener('touchstart', this.__handleMenuButton.bind(this), { passive: false });
    }
    this.__bindMovableActionButtons();
    if (this.chatExpandBtn) {
        this.chatExpandBtn.addEventListener('touchstart', this.__handleChatExpandButton.bind(this), { passive: false });
    }
    if (this.leftChannelBtn) {
        this.leftChannelBtn.addEventListener(
            'touchstart',
            this.__handleMobileChannelIncrement.bind(this, -1),
            { passive: false }
        );
    }
    if (this.rightChannelBtn) {
        this.rightChannelBtn.addEventListener(
            'touchstart',
            this.__handleMobileChannelIncrement.bind(this, 1),
            { passive: false }
        );
    }
    if (this.openChatBtn) {
        this.openChatBtn.addEventListener('touchstart', this.__handleMobileOpenChat.bind(this), { passive: false });
    }

    // Bind hotbar slot events
    this.__bindHotbarSlots();

    // Bind canvas touch events
    this.__bindCanvasTouchEvents();

    // Bind global layout events (slots)
    this.__bindGlobalEvents();

    // Bind double-tap handler for container slots (move to backpack)
    this.__bindContainerSlotDoubleTap();

    // Initialize status bars with current player stats if available
    if (typeof gameClient !== 'undefined' && gameClient && gameClient.player) {
        let state = gameClient.player.state;
        this.updateStatusBars(
            state.health || 0,
            state.maxHealth || 1,
            state.mana || 0,
            state.maxMana || 1
        );
    }

    console.log("Touch controls initialized for mobile mode");

    if (typeof gameClient !== "undefined" && gameClient && gameClient.sendClientCapabilities) {
        gameClient.sendClientCapabilities();
    }

}

Touch.prototype.__handleResize = function () {

    /*
     * Function Touch.__handleResize
     * Handle window resize to toggle mobile mode
     */

    // Use height for landscape detection (phones in landscape have low height)
    let shouldBeMobile = window.innerHeight <= 500 || window.innerWidth <= 768;

    if (shouldBeMobile && !this.isMobileMode) {
        this.__initialize();
    } else if (!shouldBeMobile && this.isMobileMode) {
        this.isMobileMode = false;
        this.__cleanup();
        if (typeof gameClient !== "undefined" && gameClient && gameClient.sendClientCapabilities) {
            gameClient.sendClientCapabilities();
        }
    } else if (shouldBeMobile) {
        this.__prepareMobileChat();
        this.__syncMobileChatViewport();
    }

}

Touch.prototype.__prepareMobileChat = function () {

    /*
     * Function Touch.__prepareMobileChat
     * Keep the original, proven channel toolbar visible on touch clients.
     *
     * The inline important fallback is intentional. Installed PWAs can briefly
     * mix an older stylesheet with newer JavaScript while a service worker is
     * activating; the toolbar must remain usable in either combination.
     */

    let header = document.querySelector('#game-wrapper .main .lower .wrapper-header');
    if (!header) {
        return;
    }

    header.classList.add('mobile-chat-toolbar');
    header.setAttribute('data-mobile-chat-ready', 'true');
    header.style.setProperty('display', 'flex', 'important');
    header.style.setProperty('visibility', 'visible', 'important');

}

Touch.prototype.__bindMobileChatViewport = function () {

    /*
     * Function Touch.__bindMobileChatViewport
     * Keep the chat composer inside Android/iOS visualViewport while the
     * on-screen keyboard is open. The binding must remain idempotent because
     * mobile mode may be initialized again after rotating the phone.
     */

    if (this.__mobileChatViewportBound) {
        return;
    }

    let input = document.getElementById('chat-input');
    if (!input) {
        return;
    }

    this.__mobileChatViewportBound = true;
    this.__mobileChatInput = input;
    this.__boundMobileChatViewportSync = this.__syncMobileChatViewport.bind(this);

    input.addEventListener('focus', function () {
        this.__mobileChatViewportTimers.forEach(function (timer) {
            clearTimeout(timer);
        });
        this.__mobileChatViewportTimers = new Array();
        this.__mobileChatBlurPending = false;
        this.__mobileChatInputFocused = true;
        this.__scheduleMobileChatViewportSync();
    }.bind(this));

    input.addEventListener('blur', function () {
        // Keep the composer stationary long enough for a tap on Send to
        // deliver its click. Resetting the fixed panel synchronously during
        // blur can move the button away before Android dispatches click.
        this.__mobileChatBlurPending = true;
        this.__mobileChatViewportTimers.forEach(function (timer) {
            clearTimeout(timer);
        });
        this.__mobileChatViewportTimers = [
            setTimeout(function () {
                this.__mobileChatBlurPending = false;
                this.__mobileChatInputFocused = false;
                this.__boundMobileChatViewportSync();
            }.bind(this), 180)
        ];
    }.bind(this));

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', this.__boundMobileChatViewportSync);
        window.visualViewport.addEventListener('scroll', this.__boundMobileChatViewportSync);
    }

    window.addEventListener('orientationchange', this.__boundMobileChatViewportSync);

}

Touch.prototype.__scheduleMobileChatViewportSync = function () {

    /*
     * Android animates its keyboard and reports several viewport sizes. Update
     * immediately and after the animation settles instead of trusting only the
     * first focus event.
     */

    this.__mobileChatViewportTimers.forEach(function (timer) {
        clearTimeout(timer);
    });
    this.__mobileChatViewportTimers = new Array();

    this.__syncMobileChatViewport();

    [50, 150, 300].forEach(function (delay) {
        this.__mobileChatViewportTimers.push(
            setTimeout(this.__boundMobileChatViewportSync, delay)
        );
    }, this);

}

Touch.prototype.__resetMobileChatViewport = function (chatContainer) {

    chatContainer.classList.remove('mobile-chat-keyboard-open');
    chatContainer.classList.remove('mobile-chat-keyboard-tiny');

    [
        '--mobile-chat-viewport-top',
        '--mobile-chat-viewport-height',
        '--mobile-chat-viewport-width',
        '--mobile-chat-viewport-center-x'
    ].forEach(function (property) {
        chatContainer.style.removeProperty(property);
    });

}

Touch.prototype.__syncMobileChatViewport = function () {

    /*
     * Function Touch.__syncMobileChatViewport
     * Position the compact composer at the safe top of the mobile viewport.
     * Some Android keyboards expose an accessory strip without subtracting it
     * from visualViewport. Bottom anchoring would therefore leave the input
     * hidden behind that strip even though the channel toolbar remains visible.
     */

    let chatContainer = document.querySelector('#game-wrapper .main .lower');
    if (!chatContainer) {
        return;
    }

    let input = this.__mobileChatInput || document.getElementById('chat-input');
    let inputFocused = this.__mobileChatInputFocused
        && input
        && (document.activeElement === input || this.__mobileChatBlurPending);
    if (!this.isMobileMode || !inputFocused) {
        return this.__resetMobileChatViewport(chatContainer);
    }

    // Focusing the mobile input is an explicit request to open the chat. This
    // also covers portrait layouts where the panel may be visible without the
    // mobile-chat-active class before the first touch.
    chatContainer.classList.add('mobile-chat-active');

    let viewport = window.visualViewport;
    let viewportTop = viewport ? viewport.offsetTop : 0;
    let viewportLeft = viewport ? viewport.offsetLeft : 0;
    let viewportWidth = viewport ? viewport.width : window.innerWidth;

    viewportTop = Number.isFinite(viewportTop) ? viewportTop : 0;
    viewportLeft = Number.isFinite(viewportLeft) ? viewportLeft : 0;
    viewportWidth = Math.max(120, Number(viewportWidth) || window.innerWidth || 120);

    let statusBar = document.getElementById('mobile-status-bar');
    let statusBarBottom = 0;

    if (statusBar && typeof statusBar.getBoundingClientRect === 'function') {
        let statusBarRect = statusBar.getBoundingClientRect();
        statusBarBottom = Number(statusBarRect.bottom) || 0;
    }

    let margin = 4;
    let composerHeight = 52;
    let composerTop = Math.max(viewportTop, statusBarBottom) + margin;

    chatContainer.style.setProperty('--mobile-chat-viewport-top', composerTop + 'px');
    chatContainer.style.setProperty('--mobile-chat-viewport-height', composerHeight + 'px');
    chatContainer.style.setProperty('--mobile-chat-viewport-width', viewportWidth + 'px');
    chatContainer.style.setProperty(
        '--mobile-chat-viewport-center-x',
        (viewportLeft + (viewportWidth / 2)) + 'px'
    );

    chatContainer.classList.add('mobile-chat-keyboard-open');
    chatContainer.classList.add('mobile-chat-keyboard-tiny');

}

Touch.prototype.__cleanup = function () {

    /*
     * Function Touch.__cleanup
     * Clean up mobile controls when switching to desktop mode
     */

    this.joystick.active = false;
    this.joystick.touchIdentifier = null;
    this.joystick.direction = null;
    this.__stopJoystickMovementLoop();
    this.__resetJoystickVisual();

    this.__clearItemDrag();
    this.__cancelPendingCanvasWalk();

    let chatContainer = document.querySelector('#game-wrapper .main .lower');
    if (chatContainer) {
        this.__resetMobileChatViewport(chatContainer);
    }

}

Touch.prototype.__bindCanvasTouchEvents = function () {

    /*
     * Function Touch.__bindCanvasTouchEvents
     * Bind touch events to the game canvas for interaction
     */

    let canvas = document.getElementById('screen');
    if (!canvas) return;

    canvas.addEventListener('touchstart', this.__handleCanvasTouchStart.bind(this), { passive: false });
    canvas.addEventListener('touchend', this.__handleCanvasTouchEnd.bind(this), { passive: false });
    canvas.addEventListener('touchmove', this.__handleCanvasTouchMove.bind(this), { passive: false });

}

Touch.prototype.__handleCanvasTouchStart = function (event) {

    /*
     * Function Touch.__handleCanvasTouchStart
     * Handle touch start on game canvas
     */

    if (!gameClient || !gameClient.networkManager.isConnected()) return;
    if (gameClient.player && gameClient.player.isDead) return;

    event.preventDefault();

    let touch = event.touches[0];
    this.touchStartTime = Date.now();
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.longPressTriggered = false;
    this.__cancelPendingCanvasWalk();

    // Start long press timer for Look action
    this.longPressTimer = setTimeout(() => {
        this.longPressTriggered = true;
        this.__cancelPendingCanvasWalk();
        this.__performLookAtTouch(touch);
    }, this.LONG_PRESS_DURATION);

}

Touch.prototype.__handleCanvasTouchMove = function (event) {

    /*
     * Function Touch.__handleCanvasTouchMove
     * Handle touch move on canvas - cancel long press if moved too much
     */

    event.preventDefault();

    let touch = event.touches[0];
    let dx = Math.abs(touch.clientX - this.touchStartX);
    let dy = Math.abs(touch.clientY - this.touchStartY);

    // If moved more than threshold, cancel long press
    if (dx > 10 || dy > 10) {
        this.__cancelLongPress();
        this.__cancelPendingCanvasWalk();
    }

}

Touch.prototype.__handleCanvasTouchEnd = function (event) {

    /*
     * Function Touch.__handleCanvasTouchEnd
     * Handle touch end on game canvas
     */

    event.preventDefault();

    this.__cancelLongPress();

    // The delegated body handler completes an active item drop. Do not turn
    // the same gesture into a walk/use tap first.
    if (this.itemDrag !== null && this.itemDrag.active) {
        this.longPressTriggered = false;
        return;
    }

    // If long press was triggered, don't do tap action
    if (this.longPressTriggered) {
        this.longPressTriggered = false;
        return;
    }

    let touchDuration = Date.now() - this.touchStartTime;

    // Short tap - perform action based on mode
    if (touchDuration < 300) {
        if (!this.__performCanvasDoubleTapAction()) {
            this.__performTapAction();
        }
    }

}

Touch.prototype.__performCanvasDoubleTapAction = function () {

    let fakeEvent = {
        clientX: this.touchStartX,
        clientY: this.touchStartY
    };
    let tileObject = gameClient.mouse.getWorldObject(fakeEvent);

    if (!tileObject || !tileObject.which) {
        this.lastCanvasTapTime = 0;
        this.lastCanvasTapTile = null;
        return false;
    }

    let now = Date.now();
    let isDoubleTap = (
        this.lastCanvasTapTile === tileObject.which &&
        now - this.lastCanvasTapTime <= this.CANVAS_DOUBLE_TAP_INTERVAL
    );

    this.lastCanvasTapTime = now;
    this.lastCanvasTapTile = tileObject.which;

    if (!isDoubleTap) {
        return false;
    }

    this.lastCanvasTapTime = 0;
    this.lastCanvasTapTile = null;

    // Creature taps remain combat toggles: two quick taps should mean two
    // toggles, never an attempt to use the floor underneath a monster.
    let otherCreatures = gameClient.mouse.getOtherCreatures(tileObject.which);
    if (otherCreatures.size > 0) {
        return false;
    }

    // Cancel the short walk reservation made by the first tap. Mouse.use()
    // either executes immediately or walks beside a distant ladder/door and
    // completes Use.
    this.__cancelPendingCanvasWalk();
    gameClient.mouse.cancelPendingActions();
    gameClient.world.pathfinder.setPathfindCache(null);
    gameClient.mouse.use(tileObject);
    return true;

}

Touch.prototype.__cancelLongPress = function () {

    if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
    }

}

Touch.prototype.__clearCanvasTapHighlight = function () {

    if (this.canvasTapHighlightTimer != null) {
        clearTimeout(this.canvasTapHighlightTimer);
        this.canvasTapHighlightTimer = null;
    }

    if (this.canvasTapHighlight != null) {
        if (typeof this.canvasTapHighlight.remove === 'function') {
            this.canvasTapHighlight.remove();
        } else if (this.canvasTapHighlight.parentNode) {
            this.canvasTapHighlight.parentNode.removeChild(this.canvasTapHighlight);
        }
        this.canvasTapHighlight = null;
    }

}

Touch.prototype.__showCanvasTapHighlight = function (event) {

    this.__clearCanvasTapHighlight();

    let canvas = document.getElementById('screen');
    if (!canvas || !document.body || typeof document.createElement !== 'function') {
        return;
    }

    let rect = canvas.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
        return;
    }

    // The game viewport always contains 15 x 11 SQMs. Calculate the touched
    // screen cell after CSS scaling so the feedback stays square in portrait
    // and landscape orientations.
    let tileWidth = rect.width / 15;
    let tileHeight = rect.height / 11;
    let column = Math.floor((event.clientX - rect.left) / tileWidth);
    let row = Math.floor((event.clientY - rect.top) / tileHeight);

    if (column < 0 || column >= 15 || row < 0 || row >= 11) {
        return;
    }

    let highlight = document.createElement('div');
    highlight.className = 'mobile-tap-tile-highlight';
    highlight.style.left = (rect.left + column * tileWidth) + 'px';
    highlight.style.top = (rect.top + row * tileHeight) + 'px';
    highlight.style.width = tileWidth + 'px';
    highlight.style.height = tileHeight + 'px';
    document.body.appendChild(highlight);

    this.canvasTapHighlight = highlight;
    this.canvasTapHighlightTimer = setTimeout(
        this.__clearCanvasTapHighlight.bind(this),
        this.CANVAS_TAP_HIGHLIGHT_DURATION
    );

}

Touch.prototype.__cancelPendingCanvasWalk = function () {

    if (this.pendingCanvasWalkTimer != null) {
        clearTimeout(this.pendingCanvasWalkTimer);
        this.pendingCanvasWalkTimer = null;
    }

    this.__clearCanvasTapHighlight();

}

Touch.prototype.__scheduleCanvasWalk = function (event, targetTile) {

    this.__cancelPendingCanvasWalk();
    this.__showCanvasTapHighlight(event);

    // Stop the old route immediately, then briefly reserve the new destination
    // so a second tap on the same SQM can become Use instead of Walk.
    gameClient.mouse.cancelPendingActions();
    gameClient.world.pathfinder.setPathfindCache(null);

    this.pendingCanvasWalkTimer = setTimeout(function () {
        this.pendingCanvasWalkTimer = null;

        if (
            !gameClient ||
            !gameClient.player ||
            gameClient.player.isDead ||
            (
                gameClient.networkManager &&
                !gameClient.networkManager.isConnected()
            )
        ) {
            this.__clearCanvasTapHighlight();
            return;
        }

        gameClient.world.pathfinder.findPath(
            gameClient.player.getPosition(),
            targetTile.__position
        );
    }.bind(this), this.CANVAS_WALK_DELAY);

}

Touch.prototype.__performTapAction = function () {

    /*
     * Function Touch.__performTapAction
     * Attack a tapped creature or walk to the selected tile.
     * Looking is handled by the existing long-press gesture.
     */

    // Get tile at touch position
    let fakeEvent = {
        clientX: this.touchStartX,
        clientY: this.touchStartY
    };

    let tileObject = gameClient.mouse.getWorldObject(fakeEvent);

    if (!tileObject || !tileObject.which) return;

    // A regular tap on a creature toggles combat instead of starting
    // autowalk to the occupied SQM.
    let otherCreatures = gameClient.mouse.getOtherCreatures(tileObject.which);
    if (otherCreatures.size > 0) {
        this.__cancelPendingCanvasWalk();
        gameClient.world.targetMonster(otherCreatures);
        return;
    }

    let targetTile = gameClient.renderer.screen.getWorldCoordinates(fakeEvent);
    if (targetTile) {
        this.__scheduleCanvasWalk(fakeEvent, targetTile);
    }

}

Touch.prototype.__performLookAtTouch = function (touch) {

    /*
     * Function Touch.__performLookAtTouch
     * Perform look action at touch position (long press)
     */

    let fakeEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY
    };

    let tileObject = gameClient.mouse.getWorldObject(fakeEvent);

    if (tileObject && tileObject.which) {
        // Check if we are interacting with a container (e.g., corpse)
        // If so, we want to open it (use) instead of look
        let topItem = null;

        // Check if peekItem exists (it should for Tiles and Containers)
        if (typeof tileObject.which.peekItem === 'function') {
            topItem = tileObject.which.peekItem(0xFF);
        }

        if (topItem && topItem.isContainer()) {
            // It's a container/corpse - open it
            console.log("Can loot! Using: ", tileObject);
            gameClient.mouse.use(tileObject);
        } else {
            // Default behavior - Look
            gameClient.mouse.look(tileObject);
        }
    }

    // Visual feedback - brief vibration if supported
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }

}

Touch.prototype.__handleJoystickStart = function (event) {

    /*
     * Function Touch.__handleJoystickStart
     * Handle joystick touch start
     */

    // The joystick owns only the finger which started it. Other fingers must
    // remain free to press hotkeys, action buttons and the rest of the UI.
    if (this.joystick.active || !event.changedTouches || event.changedTouches.length === 0) {
        return;
    }

    event.preventDefault();
    this.__cancelPendingCanvasWalk();

    let touch = event.changedTouches[0];
    let rect = this.joystickZone.getBoundingClientRect();

    this.joystick.active = true;
    this.joystick.touchIdentifier = touch.identifier;
    this.joystick.startX = rect.left + rect.width / 2;
    this.joystick.startY = rect.top + rect.height / 2;
    this.joystick.currentX = touch.clientX;
    this.joystick.currentY = touch.clientY;

    this.__updateJoystickVisual();
    this.__processJoystickInput();

}

Touch.prototype.__handleJoystickMove = function (event) {

    /*
     * Function Touch.__handleJoystickMove
     * Handle joystick touch move
     */

    if (!this.joystick.active) return;

    let touch = this.__findTouchByIdentifier(
        event.touches,
        this.joystick.touchIdentifier
    );
    if (touch === null) return;

    event.preventDefault();
    this.joystick.currentX = touch.clientX;
    this.joystick.currentY = touch.clientY;

    this.__updateJoystickVisual();
    this.__processJoystickInput();

}

Touch.prototype.__handleJoystickEnd = function (event) {

    /*
     * Function Touch.__handleJoystickEnd
     * Handle joystick touch end
     */

    if (!this.joystick.active) return;

    let touch = this.__findTouchByIdentifier(
        event.changedTouches,
        this.joystick.touchIdentifier
    );
    if (touch === null) return;

    event.preventDefault();

    this.joystick.active = false;
    this.joystick.touchIdentifier = null;
    this.joystick.direction = null;

    this.__stopJoystickMovementLoop();
    this.__resetJoystickVisual();

}

Touch.prototype.__updateJoystickVisual = function () {

    /*
     * Function Touch.__updateJoystickVisual
     * Update the visual position of the joystick knob
     */

    if (!this.joystickKnob) return;

    let dx = this.joystick.currentX - this.joystick.startX;
    let dy = this.joystick.currentY - this.joystick.startY;

    let distance = Math.sqrt(dx * dx + dy * dy);
    let direction = distance >= this.JOYSTICK_DEADZONE
        ? this.__vectorToCardinalDirection(dx, dy)
        : null;
    let maxOffset = 9;

    dx = 0;
    dy = 0;

    if (direction === CONST.DIRECTION.NORTH) {
        dy = -maxOffset;
    } else if (direction === CONST.DIRECTION.EAST) {
        dx = maxOffset;
    } else if (direction === CONST.DIRECTION.SOUTH) {
        dy = maxOffset;
    } else if (direction === CONST.DIRECTION.WEST) {
        dx = -maxOffset;
    }

    this.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.__setJoystickVisualDirection(direction);

}

Touch.prototype.__processJoystickInput = function () {

    /*
     * Function Touch.__processJoystickInput
     * Process joystick position and move player
     */

    let dx = this.joystick.currentX - this.joystick.startX;
    let dy = this.joystick.currentY - this.joystick.startY;
    let distance = Math.sqrt(dx * dx + dy * dy);

    // Deadzone check
    if (distance < this.JOYSTICK_DEADZONE) {
        this.joystick.direction = null;
        this.__stopJoystickMovementLoop();
        return;
    }

    // The mobile D-pad deliberately supports only four cardinal directions.
    // Dominant-axis selection also prevents accidental diagonals near corners.
    let direction = this.__vectorToCardinalDirection(dx, dy);

    if (direction !== this.joystick.direction) {
        this.joystick.direction = direction;
        this.__moveInDirection(direction);
    }

    this.__startJoystickMovementLoop();

}

Touch.prototype.__findTouchByIdentifier = function (touches, identifier) {

    if (!touches) return null;

    for (let index = 0; index < touches.length; index++) {
        if (touches[index].identifier === identifier) {
            return touches[index];
        }
    }

    return null;

}

Touch.prototype.__vectorToCardinalDirection = function (dx, dy) {

    /*
     * Function Touch.__vectorToCardinalDirection
     * Convert a joystick vector to one of four cardinal directions
     */

    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? CONST.DIRECTION.EAST : CONST.DIRECTION.WEST;
    }

    return dy >= 0 ? CONST.DIRECTION.SOUTH : CONST.DIRECTION.NORTH;

}

Touch.prototype.__startJoystickMovementLoop = function () {

    /*
     * Function Touch.__startJoystickMovementLoop
     * Retry movement on the next rendered frame instead of dropping steps on a
     * fixed timer while the previous step is still being animated.
     */

    if (this.joystick.animationFrame !== null) return;

    this.joystick.animationFrame = window.requestAnimationFrame(() => {
        this.joystick.animationFrame = null;

        if (!this.joystick.active || this.joystick.direction === null) return;

        this.__moveInDirection(this.joystick.direction);
        this.__startJoystickMovementLoop();
    });

}

Touch.prototype.__stopJoystickMovementLoop = function () {

    // Do not replay a direction saved during a delayed server confirmation
    // after the user has already released the joystick.
    if (
        gameClient &&
        gameClient.player &&
        typeof gameClient.player.clearDirectionMovementBuffer === "function"
    ) {
        gameClient.player.clearDirectionMovementBuffer();
    }

    if (this.joystick.animationFrame === null) return;

    window.cancelAnimationFrame(this.joystick.animationFrame);
    this.joystick.animationFrame = null;

}

Touch.prototype.__setJoystickVisualDirection = function (direction) {

    if (!this.virtualJoystick) return;

    let directionName = null;
    if (direction === CONST.DIRECTION.NORTH) directionName = 'north';
    if (direction === CONST.DIRECTION.EAST) directionName = 'east';
    if (direction === CONST.DIRECTION.SOUTH) directionName = 'south';
    if (direction === CONST.DIRECTION.WEST) directionName = 'west';

    if (directionName === null) {
        this.virtualJoystick.removeAttribute('data-direction');
    } else {
        this.virtualJoystick.setAttribute('data-direction', directionName);
    }

}

Touch.prototype.__resetJoystickVisual = function () {

    if (this.joystickKnob) {
        this.joystickKnob.style.transform = 'translate(0, 0)';
    }

    this.__setJoystickVisualDirection(null);

}

Touch.prototype.__moveInDirection = function (direction) {

    /*
     * Function Touch.__moveInDirection
     * Move player in the specified direction
     */

    if (!gameClient || !gameClient.networkManager.isConnected()) return;
    if (gameClient.player && gameClient.player.isDead) return;
    if (gameClient.player.isMoving()) return;

    // Use keyboard's move function
    if (gameClient.keyboard) {
        gameClient.keyboard.handleMoveKey(direction);
    }

}

Touch.prototype.__handleAttackButton = function (event) {

    /*
     * Function Touch.__handleAttackButton
     * Attack current target
     */

    event.preventDefault();

    if (!gameClient || !gameClient.player) return;

    let target = gameClient.player.getTarget();

    if (target) {
        // Already have a target - attack it
        gameClient.send(new TargetPacket(target.getId()));
    } else {
        // No target - toggle battle window
        if (gameClient.interface) {
            gameClient.interface.toggleWindow("battle-window");
        }
    }

    // Vibrate feedback
    if (navigator.vibrate) navigator.vibrate(50);

}

Touch.prototype.__handleMenuButton = function (event) {

    /*
     * Function Touch.__handleMenuButton
     * Open mobile menu / settings
     */

    event.preventDefault();

    // Check if modal is already open, close it if so
    if (gameClient.interface.modalManager.isOpened()) {
        gameClient.interface.modalManager.close();
    } else {
        // Open settings modal
        gameClient.interface.modalManager.open("settings-modal");
    }

    // Vibrate feedback
    if (navigator.vibrate) navigator.vibrate(30);

}

Touch.prototype.updateStatusBars = function (health, healthMax, mana, manaMax) {

    /*
     * Function Touch.updateStatusBars
     * Update mobile status bars with current HP/MP values
     */

    if (!this.isMobileMode) return;

    if (this.healthBar && healthMax > 0) {
        let healthPercent = Math.min(100, (health / healthMax) * 100);
        this.healthBar.style.width = healthPercent + '%';
    }

    if (this.healthText) {
        this.healthText.textContent = health + ' / ' + healthMax;
    }

    if (this.manaBar && manaMax > 0) {
        let manaPercent = Math.min(100, (mana / manaMax) * 100);
        this.manaBar.style.width = manaPercent + '%';
    }

    if (this.manaText) {
        this.manaText.textContent = mana + ' / ' + manaMax;
    }

}

Touch.prototype.__handleInventoryButton = function (event) {

    /*
     * Function Touch.__handleInventoryButton
     * Open, show or hide the backpack equipped by the player.
     */

    event.preventDefault();
    event.stopPropagation();

    if (!gameClient || !gameClient.player) return;

    let equipment = gameClient.player.equipment;
    let backpackItem = equipment ? equipment.getSlotItem(6) : null;

    if (backpackItem === null) {
        gameClient.interface.setCancelMessage("You are not wearing a backpack.");
        if (navigator.vibrate) navigator.vibrate(30);
        return;
    }

    // Match the open window to the item currently worn in the backpack slot.
    // Other bags and nested containers remain untouched.
    let containers = Array.from(gameClient.player.__openedContainers || []);
    let backpack = containers.find(function (container) {
        return container && container.id === backpackItem.id;
    });

    if (backpack && backpack.window && backpack.window.__element) {
        let element = backpack.window.__element;
        let isHidden = window.getComputedStyle(element).display === 'none';
        element.style.display = isHidden ? 'flex' : 'none';
    } else {
        // Use the equipped item exactly like a double tap/right click on its
        // equipment slot. The server remains responsible for opening it.
        gameClient.mouse.use({
            which: equipment,
            index: 6
        });
    }

    if (navigator.vibrate) navigator.vibrate(30);

}

Touch.prototype.__handleEquipmentButton = function (event) {

    /*
     * Function Touch.__handleEquipmentButton
     * Toggle equipment panel visibility
    */

    event.preventDefault();
    event.stopPropagation();

    if (!gameClient || !gameClient.player) return;

    let equipmentElement = document.querySelector('.equipment.wrapper');
    if (equipmentElement !== null) {
        let isHidden = window.getComputedStyle(equipmentElement).display === 'none';
        equipmentElement.style.display = isHidden ? 'flex' : 'none';
    }

    // Vibrate feedback
    if (navigator.vibrate) navigator.vibrate(30);

}

Touch.prototype.__handleChatButton = function (event) {

    /*
     * Function Touch.__handleChatButton
     * Toggle chat panel visibility
     */

    event.preventDefault();

    // Find the chat container (.lower)
    let chatContainer = document.querySelector('#game-wrapper .main .lower');

    if (chatContainer) {
        this.__prepareMobileChat();

        // Toggle the mobile-chat-active class
        chatContainer.classList.toggle('mobile-chat-active');

        // Opening the panel is browse-only. The player explicitly taps the
        // composer when they want to unlock it and summon the mobile keyboard.
        if (gameClient.interface && gameClient.interface.channelManager) {
            gameClient.interface.channelManager.setInputLocked(true);
        }

        if (!chatContainer.classList.contains('mobile-chat-active')) {
            chatContainer.classList.remove('mobile-chat-expanded');
            this.__updateChatExpandButton(false);
        }
    }

    // Vibrate feedback
    if (navigator.vibrate) navigator.vibrate(30);

}

Touch.prototype.__handleChatExpandButton = function (event) {

    /*
     * Function Touch.__handleChatExpandButton
     * Switch between compact and expanded mobile chat sizes.
     */

    event.preventDefault();
    event.stopPropagation();

    let chatContainer = document.querySelector('#game-wrapper .main .lower');
    if (!chatContainer || !chatContainer.classList.contains('mobile-chat-active')) {
        return;
    }

    chatContainer.classList.toggle('mobile-chat-expanded');
    this.__updateChatExpandButton(chatContainer.classList.contains('mobile-chat-expanded'));

    if (navigator.vibrate) navigator.vibrate(20);

}

Touch.prototype.__updateChatExpandButton = function (expanded) {

    if (!this.chatExpandBtn) {
        return;
    }

    this.chatExpandBtn.innerHTML = expanded ? 'unfold_less' : 'unfold_more';
    this.chatExpandBtn.title = expanded ? 'Collapse chat' : 'Expand chat';
    this.chatExpandBtn.setAttribute('aria-label', this.chatExpandBtn.title);

}

Touch.prototype.__handleMobileChannelIncrement = function (increment, event) {

    event.preventDefault();
    event.stopPropagation();

    if (gameClient.interface && gameClient.interface.channelManager) {
        gameClient.interface.channelManager.handleChannelIncrement(increment);
    }

    if (navigator.vibrate) navigator.vibrate(12);

}

Touch.prototype.__handleMobileOpenChat = function (event) {

    event.preventDefault();
    event.stopPropagation();
    if (this.openChatBtn) {
        this.openChatBtn.click();
    }

}

Touch.prototype.__bindMovableActionButtons = function () {

    let controls = [
        [this.equipmentBtn, "equipment", this.__handleEquipmentButton],
        [this.inventoryBtn, "inventory", this.__handleInventoryButton],
        [this.attackBtn, "attack", this.__handleAttackButton],
        [this.chatBtn, "chat", this.__handleChatButton]
    ];

    controls.forEach(function (entry) {
        if (!entry[0]) {
            return;
        }

        this.controlLayout.register(entry[0], entry[1], {
            onTap: entry[2].bind(this)
        });
    }, this);

}

Touch.prototype.__bindHotbarSlots = function () {

    /*
     * Function Touch.__bindHotbarSlots
     * Bind tap/edit/drag gestures to the complete mobile hotbar.
     */

    let hotbar = document.getElementById('mobile-hotbar');

    if (!hotbar) {
        return;
    }

    this.controlLayout.register(hotbar, "hotbar", {
        onTap: function (event, target) {
            let slot = target && target.closest ? target.closest('.mobile-hotbar-slot') : null;
            if (!slot || !hotbar.contains(slot)) {
                return;
            }

            this.__handleHotbarSlotTap(Number(slot.getAttribute('data-slot')));
        }.bind(this),
        onLongPress: function (event, target) {
            let slot = target && target.closest ? target.closest('.mobile-hotbar-slot') : null;
            if (!slot || !hotbar.contains(slot)) {
                return;
            }

            this.__openHotbarSlotEditor(Number(slot.getAttribute('data-slot')));
        }.bind(this)
    });

}

Touch.prototype.__handleHotbarSlotTap = function (slotIndex) {

    /*
     * Function Touch.__handleHotbarSlotTap
     * Use a configured slot. Empty slots open the same editor used by the
     * desktop Add/Edit context-menu action.
     */

    if (!gameClient || !gameClient.interface) return;

    let manager = gameClient.interface.hotbarManager;

    if (!manager || !manager.slots || !manager.slots[slotIndex]) {
        return;
    }

    let slot = manager.slots[slotIndex];

    if (slot.spell === null && slot.text === null && slot.item === null) {
        this.__openHotbarSlotEditor(slotIndex);
        return;
    }

    // Map slot index (0-3) to F1-F4 keys (112-115)
    let fKeyCode = 112 + slotIndex;

    // Use the hotbar manager to handle the key press
    manager.handleKeyPress(fKeyCode);

    // Vibrate feedback
    if (navigator.vibrate) navigator.vibrate(20);

}

Touch.prototype.__openHotbarSlotEditor = function (slotIndex) {

    if (
        !Number.isInteger(slotIndex) ||
        slotIndex < 0 ||
        slotIndex > 3 ||
        !gameClient ||
        !gameClient.interface ||
        !gameClient.interface.modalManager
    ) {
        return;
    }

    gameClient.interface.modalManager.open("hotbar-config-modal", slotIndex);

    if (navigator.vibrate) {
        navigator.vibrate(20);
    }

}

Touch.prototype.syncMobileHotbar = function () {

    /*
     * Function Touch.syncMobileHotbar
     * Sync mobile hotbar slots with desktop hotbar icons
     */

    if (!this.isMobileMode) return;
    if (!gameClient || !gameClient.interface || !gameClient.interface.hotbarManager) return;

    let desktopSlots = gameClient.interface.hotbarManager.slots;
    let mobileSlots = document.querySelectorAll('.mobile-hotbar-slot');
    // The desktop manager is the source of truth. Copy its already-rendered
    // canvas so mobile receives spells, item sprites, text icons and cooldowns
    // instead of maintaining a second incomplete renderer.
    mobileSlots.forEach((mobileSlot, index) => {
        if (index >= desktopSlots.length) return;

        let desktopSlot = desktopSlots[index];
        let canvas = mobileSlot.querySelector('canvas');
        let duration = mobileSlot.querySelector('.mobile-slot-duration');

        if (!canvas) return;

        let ctx = canvas.getContext('2d');

        // Set canvas size
        canvas.width = 32;
        canvas.height = 32;

        // Clear canvas
        ctx.clearRect(0, 0, 32, 32);

        if (desktopSlot.canvas && desktopSlot.canvas.canvas) {
            ctx.drawImage(desktopSlot.canvas.canvas, 0, 0, 32, 32);
        }

        mobileSlot.title = desktopSlot.canvas.canvas.parentNode.title || '';
        mobileSlot.classList.toggle(
            'active',
            desktopSlot.canvas.canvas.parentNode.classList.contains('active')
        );

        if (duration) {
            duration.textContent = desktopSlot.duration ? desktopSlot.duration.textContent : '';
        }
    });

}

Touch.prototype.__bindGlobalEvents = function () {

    /*
     * Function Touch.__bindGlobalEvents
     * Binds global touch start across the document to detect slot interactions
     */

    document.body.addEventListener('touchstart', this.__handleGlobalTouchStart.bind(this), { passive: false });
    document.body.addEventListener('touchmove', this.__handleGlobalTouchMove.bind(this), { passive: false });
    document.body.addEventListener('touchend', this.__handleGlobalTouchEnd.bind(this), { passive: false });
    document.body.addEventListener('touchcancel', this.__handleGlobalTouchCancel.bind(this), { passive: false });

}

Touch.prototype.resetMobileControlLayout = function () {

    if (this.controlLayout) {
        this.controlLayout.reset();
    }

}

Touch.prototype.__handleGlobalTouchStart = function (event) {

    /*
     * Function Touch.__handleGlobalTouchStart
     * Handles global touch events to detect double tap on slots
     */

    if (!this.isMobileMode) return;

    // Use the first changed touch
    let touch = event.changedTouches[0];

    // Find the element at the touch coordinates
    let element = document.elementFromPoint(touch.clientX, touch.clientY);

    if (!element) return;

    // Check if we touched a slot or inside a slot
    let slotElement = element.closest('.slot');

    this.__prepareItemDrag(touch, element, slotElement);

    if (slotElement) {

        let currentTime = new Date().getTime();
        let tapLength = currentTime - this.lastTapTime;

        // Double tap detection (< 300ms)
        if (tapLength < 300 && tapLength > 0 && this.lastTapTarget === slotElement) {

            // Successfully detected double tap on same slot
            event.preventDefault();
            this.__handleSlotDoubleTap(slotElement);

            // Access granted, reset tap time
            this.lastTapTime = 0;

        } else {

            // First tap
            this.lastTapTime = currentTime;
            this.lastTapTarget = slotElement;

        }

    } else {
        // Tapped outside a slot, reset
        this.lastTapTime = 0;
        this.lastTapTarget = null;
    }

}

Touch.prototype.__prepareItemDrag = function (touch, element, slotElement) {

    if (
        !gameClient ||
        !gameClient.player ||
        !gameClient.networkManager.isConnected() ||
        (gameClient.mouse && gameClient.mouse.__multiUseObject !== null)
    ) {
        this.itemDrag = null;
        return;
    }

    let fromObject = null;
    let sourceElement = null;
    let screen = gameClient.renderer && gameClient.renderer.screen
        ? gameClient.renderer.screen.canvas
        : null;

    if (slotElement !== null) {
        fromObject = this.__getSlotObject(slotElement);
        sourceElement = slotElement;
    } else if (element === screen) {
        fromObject = gameClient.mouse.getWorldObject({
            clientX: touch.clientX,
            clientY: touch.clientY
        });
    }

    if (fromObject === null || fromObject.which === null) {
        this.itemDrag = null;
        return;
    }

    let item = fromObject.which.peekItem(fromObject.index);

    if (item === null || !item.isMoveable()) {
        this.itemDrag = null;
        return;
    }

    this.itemDrag = {
        active: false,
        identifier: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        fromObject: fromObject,
        item: item,
        sourceElement: sourceElement,
        indicator: null,
        dropElement: null
    };

}

Touch.prototype.__getTrackedTouch = function (touchList) {

    if (this.itemDrag === null || !touchList) return null;

    for (let index = 0; index < touchList.length; index++) {
        if (touchList[index].identifier === this.itemDrag.identifier) {
            return touchList[index];
        }
    }

    return null;

}

Touch.prototype.__handleGlobalTouchMove = function (event) {

    if (!this.isMobileMode || this.itemDrag === null) return;

    let touch = this.__getTrackedTouch(event.touches);
    if (touch === null) return;

    let dx = touch.clientX - this.itemDrag.startX;
    let dy = touch.clientY - this.itemDrag.startY;

    if (!this.itemDrag.active && Math.hypot(dx, dy) < 8) {
        return;
    }

    if (!this.itemDrag.active) {
        this.__beginItemDrag(touch);
    }

    event.preventDefault();
    this.__cancelLongPress();
    this.__positionItemDragIndicator(touch);
    this.__updateItemDropHighlight(touch);

}

Touch.prototype.__beginItemDrag = function (touch) {

    this.itemDrag.active = true;

    let indicator = document.createElement('div');
    indicator.className = 'mobile-item-drag-indicator';

    let canvasElement = document.createElement('canvas');
    indicator.appendChild(canvasElement);
    document.body.appendChild(indicator);

    let sourceCanvas = this.itemDrag.sourceElement
        ? this.itemDrag.sourceElement.querySelector('canvas')
        : null;

    if (sourceCanvas !== null) {
        canvasElement.width = 32;
        canvasElement.height = 32;
        canvasElement.getContext('2d').drawImage(sourceCanvas, 0, 0, 32, 32);
    } else {
        let canvas = new Canvas(canvasElement, 32, 32);
        canvas.drawSprite(this.itemDrag.item, new Position(0, 0), 32);
    }

    this.itemDrag.indicator = indicator;

    if (this.itemDrag.sourceElement !== null) {
        this.itemDrag.sourceElement.classList.add('mobile-item-drag-source');
    }

    this.__positionItemDragIndicator(touch);

    if (navigator.vibrate) navigator.vibrate(15);

}

Touch.prototype.__positionItemDragIndicator = function (touch) {

    if (this.itemDrag === null || this.itemDrag.indicator === null) return;

    this.itemDrag.indicator.style.left = touch.clientX + 'px';
    this.itemDrag.indicator.style.top = touch.clientY + 'px';

}

Touch.prototype.__getDropObjectAt = function (touch) {

    let element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (element === null) return null;

    let slotElement = element.closest('.slot');
    if (slotElement !== null) {
        return this.__getSlotObject(slotElement);
    }

    let screen = gameClient.renderer && gameClient.renderer.screen
        ? gameClient.renderer.screen.canvas
        : null;

    if (element === screen) {
        return gameClient.mouse.getWorldObject({
            clientX: touch.clientX,
            clientY: touch.clientY
        });
    }

    return null;

}

Touch.prototype.__updateItemDropHighlight = function (touch) {

    if (this.itemDrag === null) return;

    if (this.itemDrag.dropElement !== null) {
        this.itemDrag.dropElement.classList.remove('mobile-item-drop-target');
        this.itemDrag.dropElement = null;
    }

    let element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (element === null) return;

    let slotElement = element.closest('.slot');
    if (slotElement !== null) {
        slotElement.classList.add('mobile-item-drop-target');
        this.itemDrag.dropElement = slotElement;
    }

}

Touch.prototype.__handleGlobalTouchEnd = function (event) {

    if (!this.isMobileMode || this.itemDrag === null) return;

    let touch = this.__getTrackedTouch(event.changedTouches);
    if (touch === null) return;

    let drag = this.itemDrag;

    if (!drag.active) {
        this.itemDrag = null;
        return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    let toObject = this.__getDropObjectAt(touch);
    this.__clearItemDrag();

    if (toObject !== null) {
        gameClient.mouse.moveItem(drag.fromObject, toObject);
    }

}

Touch.prototype.__handleGlobalTouchCancel = function (event) {

    if (this.itemDrag === null) return;

    let touch = this.__getTrackedTouch(event.changedTouches);
    if (touch !== null) {
        this.__clearItemDrag();
    }

}

Touch.prototype.__clearItemDrag = function () {

    if (this.itemDrag === null) return;

    if (this.itemDrag.sourceElement !== null) {
        this.itemDrag.sourceElement.classList.remove('mobile-item-drag-source');
    }

    if (this.itemDrag.dropElement !== null) {
        this.itemDrag.dropElement.classList.remove('mobile-item-drop-target');
    }

    if (this.itemDrag.indicator !== null) {
        this.itemDrag.indicator.remove();
    }

    this.itemDrag = null;

}

Touch.prototype.__handleSlotDoubleTap = function (slotElement) {

    /*
     * Function Touch.__handleSlotDoubleTap
     * Handles double tap on a slot -> Simulates "Use"
     */

    let slotObject = this.__getSlotObject(slotElement);

    if (slotObject && slotObject.which) {
        // Feedback
        if (navigator.vibrate) navigator.vibrate(50);

        // Use the item (Open backpack, use consumable, etc)
        // Delegating to Mouse 'use' logic if available or directly sending packet
        if (gameClient.mouse && gameClient.mouse.use) {
            gameClient.mouse.use(slotObject);
        }
    }

}

Touch.prototype.__getSlotObject = function (element) {

    /*
     * Function Touch.__getSlotObject
     * Resolves a DOM element to a game object (Container or Equipment slot)
     * Ported logic from Mouse.__getSlotObject
     */

    if (!element) return null;

    let slotIndex = Number(element.getAttribute("slotIndex"));
    let containerElement = element.closest("[containerIndex]");
    let containerIndex = containerElement === null
        ? NaN
        : Number(containerElement.getAttribute("containerIndex"));

    if (isNaN(slotIndex) || isNaN(containerIndex)) return null;

    // Fetch the container from the player
    let container = gameClient.player.getContainer(containerIndex);

    if (!container) return null;

    return new Object({
        "which": container,
        "index": slotIndex
    });

}

Touch.prototype.__bindContainerSlotDoubleTap = function () {

    /*
     * Function Touch.__bindContainerSlotDoubleTap
     * Binds a delegated event listener for double-tap on container slots.
     * Double-tapping an item will move it to the first available backpack slot.
     */

    let self = this;
    let lastSlotTapTime = 0;
    let lastSlotTapElement = null;
    const DOUBLE_TAP_THRESHOLD = 300; // ms

    // Use delegated listener on document body to catch dynamically created slots
    document.body.addEventListener('touchend', function (event) {
        if (!self.isMobileMode) return;
        if (!gameClient || !gameClient.player) return;

        // Check if the tap target is a slot element
        let target = event.target;
        let slotElement = target.closest('.slot');

        if (!slotElement) return;

        // Ignore equipment slots (they have different parent structure)
        let containerWindow = slotElement.closest('.window[containerIndex]');
        if (!containerWindow) return;

        let now = Date.now();

        // Check for double tap on the same slot
        if (lastSlotTapElement === slotElement && (now - lastSlotTapTime) < DOUBLE_TAP_THRESHOLD) {
            // Double tap detected!
            event.preventDefault();
            event.stopPropagation();

            self.__handleSlotDoubleTap(slotElement, containerWindow);

            // Reset
            lastSlotTapTime = 0;
            lastSlotTapElement = null;
        } else {
            // First tap - record it
            lastSlotTapTime = now;
            lastSlotTapElement = slotElement;
        }
    }, { passive: false });

}

Touch.prototype.__handleSlotDoubleTap = function (slotElement, containerWindow) {

    /*
     * Function Touch.__handleSlotDoubleTap
     * Handle double-tap on a container slot - move item to backpack
     */

    if (!slotElement) return;

    // If containerWindow not passed, try to find it from slotElement
    if (!containerWindow) {
        containerWindow = slotElement.closest('.window[containerIndex]');
    }

    // Get source slot info
    let slotIndex = Number(slotElement.getAttribute('slotIndex'));

    // Handle case where containerWindow is still null (e.g., equipment slots)
    if (!containerWindow) {
        console.log("Double tap: Not a container slot, ignoring");
        return;
    }

    let containerIndex = Number(containerWindow.getAttribute('containerIndex'));

    if (isNaN(slotIndex) || isNaN(containerIndex)) {
        console.log("Double tap: Invalid slot/container index");
        return;
    }

    let sourceContainer = gameClient.player.getContainer(containerIndex);
    if (!sourceContainer) {
        console.log("Double tap: Source container not found");
        return;
    }

    let item = sourceContainer.getSlotItem(slotIndex);
    if (!item) {
        console.log("Double tap: No item in slot");
        return;
    }

    // Find the first open backpack (excluding Equipment which is usually container 0)
    // Look for container with __containerId that's not the same as source
    let targetContainer = null;
    let containers = Array.from(gameClient.player.__openedContainers);

    // Check if containers exists and is an array
    if (!containers || containers.length === 0) {
        console.log("Double tap: No open containers found");
        return;
    }

    for (let i = 0; i < containers.length; i++) {
        let container = containers[i];
        if (container && container.__containerId !== containerIndex) {
            // Found a different container - use it as target
            targetContainer = container;
            break;
        }
    }

    if (!targetContainer) {
        // No other container open - try to use the backpack (container 0)
        targetContainer = gameClient.player.getContainer(0);
    }

    if (!targetContainer) {
        console.log("Double tap: No destination container found");
        gameClient.interface.setCancelMessage("No backpack open to receive items.");
        return;
    }

    // Create source and target objects for sendItemMove
    let fromObject = {
        "which": sourceContainer,
        "index": slotIndex
    };

    // Find first empty slot in target container, or use slot 0
    let targetSlotIndex = 0;
    for (let i = 0; i < targetContainer.slots.length; i++) {
        if (targetContainer.slots[i].isEmpty()) {
            targetSlotIndex = i;
            break;
        }
    }

    let toObject = {
        "which": targetContainer,
        "index": targetSlotIndex
    };

    // Get item count (for stackables)
    let count = item.isStackable() ? item.count : 1;

    console.log("Double tap: Moving item from container " + containerIndex + " slot " + slotIndex +
        " to container " + targetContainer.__containerId + " slot " + targetSlotIndex);

    // Send the move
    gameClient.mouse.sendItemMove(fromObject, toObject, count);

    // Vibrate feedback
    if (navigator.vibrate) navigator.vibrate(30);

}

