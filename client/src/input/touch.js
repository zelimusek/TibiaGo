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
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        direction: null,
        animationFrame: null
    };

    // Action mode (null or 'look')
    this.actionMode = null;

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

    // One-finger item drag state. A small movement threshold keeps ordinary
    // taps available for walking, looking and using objects.
    this.itemDrag = null;

    // Initialize if on mobile or landscape
    if (this.isTouchDevice || window.innerWidth <= 768 || window.innerHeight <= 500) {
        this.__initialize();
    }

    // Listen for resize to toggle mobile mode
    window.addEventListener('resize', this.__handleResize.bind(this));

}

Touch.prototype.JOYSTICK_DEADZONE = 15;
Touch.prototype.LONG_PRESS_DURATION = 500; // ms for long press

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
    this.lookBtn = document.getElementById('mobile-look-btn');
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

    // Bind action button events
    if (this.lookBtn) {
        this.lookBtn.addEventListener('touchstart', this.__handleLookButton.bind(this), { passive: false });
    }
    if (this.attackBtn) {
        this.attackBtn.addEventListener('touchstart', this.__handleAttackButton.bind(this), { passive: false });
    }
    if (this.menuBtn) {
        this.menuBtn.addEventListener('touchstart', this.__handleMenuButton.bind(this), { passive: false });
    }
    if (this.inventoryBtn) {
        this.inventoryBtn.addEventListener('touchstart', this.__handleInventoryButton.bind(this), { passive: false });
    }
    if (this.equipmentBtn) {
        this.equipmentBtn.addEventListener('touchstart', this.__handleEquipmentButton.bind(this), { passive: false });
    }
    if (this.chatBtn) {
        this.chatBtn.addEventListener('touchstart', this.__handleChatButton.bind(this), { passive: false });
    }
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
    }

}

Touch.prototype.__cleanup = function () {

    /*
     * Function Touch.__cleanup
     * Clean up mobile controls when switching to desktop mode
     */

    this.joystick.active = false;
    this.joystick.direction = null;
    this.__stopJoystickMovementLoop();
    this.__resetJoystickVisual();

    this.actionMode = null;
    this.__clearActionButtonHighlights();
    this.__clearItemDrag();

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

    // Start long press timer for Look action
    this.longPressTimer = setTimeout(() => {
        this.longPressTriggered = true;
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

    // Explicit Look mode always owns this tap and must not accidentally become
    // the first half of a later Use gesture.
    if (this.actionMode !== null) {
        this.lastCanvasTapTime = 0;
        this.lastCanvasTapTile = null;
        return false;
    }

    let now = Date.now();
    let isDoubleTap = (
        this.lastCanvasTapTile === tileObject.which &&
        now - this.lastCanvasTapTime <= 350
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

    // Replace the walk started by the first tap. Mouse.use() either executes
    // immediately or walks beside a distant ladder/door and completes Use.
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

Touch.prototype.__performTapAction = function () {

    /*
     * Function Touch.__performTapAction
     * Perform action based on current mode (look, use, or walk)
     */

    // Get tile at touch position
    let fakeEvent = {
        clientX: this.touchStartX,
        clientY: this.touchStartY
    };

    let tileObject = gameClient.mouse.getWorldObject(fakeEvent);

    if (!tileObject || !tileObject.which) return;

    switch (this.actionMode) {
        case 'look':
            gameClient.mouse.look(tileObject);
            this.__clearActionMode();
            break;

        default:
            // A regular tap on a creature toggles combat instead of starting
            // autowalk to the occupied SQM.
            let otherCreatures = gameClient.mouse.getOtherCreatures(tileObject.which);
            if (otherCreatures.size > 0) {
                gameClient.world.targetMonster(otherCreatures);
                return;
            }

            // Default: walk to tile
            let targetTile = gameClient.renderer.screen.getWorldCoordinates(fakeEvent);
            if (targetTile) {
                gameClient.world.pathfinder.findPath(
                    gameClient.player.getPosition(),
                    targetTile.__position
                );
            }
            break;
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

    event.preventDefault();

    let touch = event.touches[0];
    let rect = this.joystickZone.getBoundingClientRect();

    this.joystick.active = true;
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

    event.preventDefault();

    let touch = event.touches[0];
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

    event.preventDefault();

    this.joystick.active = false;
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

Touch.prototype.__handleLookButton = function (event) {

    /*
     * Function Touch.__handleLookButton
     * Toggle Look mode
     */

    event.preventDefault();

    if (this.actionMode === 'look') {
        this.__clearActionMode();
    } else {
        this.actionMode = 'look';
        this.__updateActionButtonHighlights();
    }

    // Vibrate feedback
    if (navigator.vibrate) navigator.vibrate(30);

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

Touch.prototype.__clearActionMode = function () {

    this.actionMode = null;
    this.__clearActionButtonHighlights();

}

Touch.prototype.__updateActionButtonHighlights = function () {

    /*
     * Function Touch.__updateActionButtonHighlights
     * Update button visual state based on current mode
     */

    this.__clearActionButtonHighlights();

    if (this.actionMode === 'look' && this.lookBtn) {
        this.lookBtn.style.boxShadow = '0 0 10px 3px #4444ff';
    }

}

Touch.prototype.__clearActionButtonHighlights = function () {

    if (this.lookBtn) this.lookBtn.style.boxShadow = '';

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
     * Open inventory / equipment window
     */

    event.preventDefault();

    if (!gameClient || !gameClient.player) return;

    // Try to open the first container (backpack) or equipment window
    let containers = Array.from(gameClient.player.__openedContainers || []);

    if (containers.length > 0) {
        // Toggle visibility of existing containers
        containers.forEach(container => {
            if (container.window) {
                let display = container.window.style.display;
                container.window.style.display = (display === 'none') ? 'block' : 'none';
            }
        });
    } else {
        // Show a message that no containers are open
        gameClient.interface.setCancelMessage("No backpack open. Use a backpack first.");
    }

    // Vibrate feedback
    if (navigator.vibrate) navigator.vibrate(30);

}

Touch.prototype.__handleEquipmentButton = function (event) {

    /*
     * Function Touch.__handleEquipmentButton
     * Toggle equipment panel visibility
     */

    event.preventDefault();

    if (!gameClient || !gameClient.player || !gameClient.player.equipment) return;

    // Toggle equipment panel visibility
    let equipmentElement = gameClient.player.equipment.element;

    if (equipmentElement) {
        let currentDisplay = equipmentElement.style.display;
        equipmentElement.style.display = (currentDisplay === 'none') ? 'block' : 'none';
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
        // Toggle the mobile-chat-active class
        chatContainer.classList.toggle('mobile-chat-active');

        // Unlock and focus synchronously while handling the touch gesture. Mobile
        // browsers will not open the virtual keyboard for a delayed focus call.
        if (chatContainer.classList.contains('mobile-chat-active')) {
            if (gameClient.interface && gameClient.interface.channelManager) {
                gameClient.interface.channelManager.unlockInputForTouch();
            }
        } else {
            chatContainer.classList.remove('mobile-chat-expanded');
            this.__updateChatExpandButton(false);

            if (gameClient.interface && gameClient.interface.channelManager) {
                gameClient.interface.channelManager.setInputLocked(true);
            }
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

Touch.prototype.__bindHotbarSlots = function () {

    /*
     * Function Touch.__bindHotbarSlots
     * Bind touch events to mobile hotbar slots
     */

    let slots = document.querySelectorAll('.mobile-hotbar-slot');

    slots.forEach((slot, index) => {
        slot.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.__handleHotbarSlotTap(index);
        }, { passive: false });
    });

}

Touch.prototype.__handleHotbarSlotTap = function (slotIndex) {

    /*
     * Function Touch.__handleHotbarSlotTap
     * Handle tap on mobile hotbar slot - trigger corresponding F-key action
     */

    if (!gameClient || !gameClient.interface) return;

    // Map slot index (0-3) to F1-F4 keys (112-115)
    let fKeyCode = 112 + slotIndex;

    // Use the hotbar manager to handle the key press
    if (gameClient.interface.hotbarManager) {
        gameClient.interface.hotbarManager.handleKeyPress(fKeyCode);
    }

    // Vibrate feedback
    if (navigator.vibrate) navigator.vibrate(20);

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
    let icons = gameClient.interface.hotbarManager.ICONS;

    // Only sync first 4 slots (F1-F4)
    mobileSlots.forEach((mobileSlot, index) => {
        if (index >= desktopSlots.length) return;

        let desktopSlot = desktopSlots[index];
        let canvas = mobileSlot.querySelector('canvas');

        if (!canvas) return;

        let ctx = canvas.getContext('2d');

        // Set canvas size
        canvas.width = 32;
        canvas.height = 32;

        // Clear canvas
        ctx.clearRect(0, 0, 32, 32);

        // Draw spell icon if available
        if (desktopSlot.spell) {
            ctx.drawImage(
                icons,
                32 * desktopSlot.spell.icon.x,
                32 * desktopSlot.spell.icon.y,
                32, 32,
                0, 0,
                32, 32
            );
        } else if (desktopSlot.text) {
            // Draw text slot indicator
            ctx.fillStyle = '#333';
            ctx.fillRect(0, 0, 32, 32);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('TXT', 16, 16);
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
        this.actionMode !== null ||
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

