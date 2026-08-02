"use strict";

(function () {

  const CLIENT_BUILD = "20260802.3";

  // List of all scripts to load in order
  const SCRIPTS = [
    "src/utils/error.js",
    "src/utils/position.js",
    "src/input/pathfinder.js",
    "src/ui/hotbar-manager.js",
    "src/entities/condition.js",
    "src/entities/spellbook.js",
    "src/utils/casting-manager.js",
    "src/utils/__proto__.js",
    "src/utils/rgba.js",
    "src/ui/settings.js",
    "src/entities/state.js",
    "src/core/game-loop.js",
    "src/ui/status-bar.js",
    "src/core/database.js",
    "src/ui/fight-mode-selector.js",
    "src/ui/secure-mode-toggle.js",
    "src/ui/tooltip.js",
    "src/ui/quest-tracker.js",
    "src/ui/interface.js",
    "src/network/packet-handler.js",
    "src/utils/enum.js",
    "src/audio/soundbit.js",
    "src/audio/soundtrace.js",
    "src/audio/sound-manager.js",
    "src/rendering/canvas.js",
    "src/rendering/outline-canvas.js",
    "src/rendering/light-canvas.js",
    "src/rendering/weather-canvas.js",
    "src/rendering/sprite-buffer.js",
    "src/utils/object-buffer.js",
    "src/utils/eventemitter.js",
    "src/core/gameclient.js",
    "src/rendering/minimap.js",
    "src/entities/outfit.js",
    "src/entities/thing.js",
    "src/utils/dataobject.js",
    "src/utils/bitflag.js",
    "src/utils/frame-group.js",
    "src/utils/clock.js",
    "src/ui/menus/menu.js",
    "src/ui/menus/menu-hotbar.js",
    "src/ui/menus/menu-message.js",
    "src/ui/menus/menu-screen.js",
    "src/ui/menus/menu-friend-list.js",
    "src/ui/menus/menu-friend-window.js",
    "src/ui/menus/menu-chat-header.js",
    "src/ui/menus/menu-chat-body.js",
    "src/ui/menus/menu-container.js",
    "src/ui/menus/menu-manager.js",
    "src/rendering/renderer.js",
    "src/network/network-manager.js",
    "src/utils/channel-manager.js",
    "src/ui/modals/modal-manager.js",
    "src/ui/window-manager.js",
    "src/ui/window.js",
    "src/ui/window-friend.js",
    "src/ui/window-skill.js",

    "src/ui/window-battle.js",
    "src/ui/chat-resizer.js",
    "src/rendering/debugger.js",
    "src/ui/screen-element-manager.js",
    "src/ui/screen-element.js",
    "src/ui/screen-element-character.js",
    "src/ui/screen-element-message.js",
    "src/ui/screen-element-floating.js",
    "src/entities/skills.js",
    "src/utils/animation.js",
    "src/utils/distance-animation.js",
    "src/utils/box-animation.js",
    "src/entities/item.js",
    "src/utils/fluid-container.js",
    "src/utils/book.js",
    "src/rendering/sprite.js",
    "src/utils/channel.js",
    "src/utils/private-channel.js",
    "src/utils/local-channel.js",
    "src/entities/friendlist.js",
    "src/utils/message.js",
    "src/utils/message-character.js",
    "src/input/keyboard.js",
    "src/input/mouse.js",
    "src/input/mobile-control-layout.js",
    "src/input/touch.js",
    "src/entities/slot.js",
    "src/entities/container.js",
    "src/entities/equipment.js",
    "src/ui/notification.js",
    "src/utils/replay-manager.js",
    "src/network/packet.js",
    "src/network/packetwriter.js",
    "src/network/packetreader.js",
    "src/network/protocol.js",
    "src/core/world.js",
    "src/entities/creature.js",
    "src/entities/monster.js",
    "src/entities/player.js",
    "src/entities/chunk.js",
    "src/entities/tile.js",
    "src/ui/modals/modal.js",
    "src/ui/modals/modal-create-account.js",
    "src/ui/modals/modal-spellbook.js",
    "src/ui/modals/modal-hotbar-text.js",
    "src/ui/modals/modal-hotbar-config.js",
    "src/ui/modals/modal-confirm.js",
    "src/ui/modals/modal-death.js",
    "src/ui/modals/modal-radio-editor.js",
    "src/ui/modals/modal-club-bar.js",
    "src/ui/modals/modal-enter-name.js",
    "src/ui/modals/modal-map.js",
    "src/ui/modals/modal-text.js",
    "src/ui/modals/modal-move-item.js",
    "src/ui/modals/modal-outfit.js",
    "src/ui/modals/modal-chat.js",
    "src/ui/modals/modal-readable.js",
    "src/ui/modals/modal-offer.js",
    "src/ui/window-questlog.js",
    "src/core/event-queue.js",
    "src/utils/heap-event.js",
    "src/utils/binary-heap.js",
    "src/core/index.js"
  ];

  /* 
    CHANGELOG:
    - Added decorative border to main container
    - Added "News/Updates" panel to fill the center empty space
    - Refined fonts and positioning
  */

  function injectStyles() {
    const styleId = "launcher-styles";
    if (document.getElementById(styleId)) return;

    const css = `
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Roboto:wght@300;400&family=MedievalSharp&display=swap');

      .loader-wrapper {
        --party-zone-loader-art: url('./png/party-zone-loader-desktop.webp');
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background-color: #050505;
        display: flex; flex-direction: column;
        justify-content: center; align-items: center;
        z-index: 9999;
        font-family: 'Roboto', sans-serif;
        color: #e0e0e0;
      }

      .loader-wrapper::before {
        content: "";
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: var(--party-zone-loader-art) no-repeat center center;
        background-size: cover;
        opacity: 0.25;
        z-index: -1;
        filter: blur(3px);
      }

      /* MAIN CONTAINER */
      .loader-content {
        width: min(960px, 94vw);
        height: auto;
        max-height: 92vh;
        aspect-ratio: 1586 / 992;

        background: var(--party-zone-loader-art) no-repeat center center;
        background-size: cover;
        
        position: relative;
        display: flex; flex-direction: column;
        justify-content: flex-end; align-items: center;
        padding-bottom: 22px;
        box-sizing: border-box;
        overflow: hidden;

        /* DECORATIVE BORDER AROUND THE WHOLE MODAL */
        border: 2px solid #3d2e1e; /* Dark wood-ish border */
        border-radius: 8px; /* Slight radius */
        box-shadow: 
           0 0 0 2px #1a1a1a, /* Inner black line */
           0 0 0 5px #5c4128, /* Outer lighter wood line */
           0 20px 60px rgba(0,0,0,0.8); /* Deep shadow */
        
        animation: fadeIn 0.8s ease-out;
      }

      /* Live copy sits over the deliberately quiet section of the artwork. */
      .info-panel {
        position: absolute;
        top: 66%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 54%;
        min-height: 20%;
        padding: 12px 18px;
        box-sizing: border-box;
        
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        text-align: center;
        
        color: #dbeeff;
        background: rgba(4, 5, 14, 0.66);
        border: 1px solid rgba(54, 220, 255, 0.35);
        border-radius: 6px;
        box-shadow: 0 0 24px rgba(223, 37, 255, 0.18);
        z-index: 5;
      }

      .info-title {
        font-family: 'MedievalSharp', cursive;
        font-size: 24px;
        margin-bottom: 10px;
        color: #ff55df;
        text-shadow: 0 2px 3px rgba(0,0,0,0.8);
      }

      .info-text {
        font-family: 'Cinzel', serif;
        font-size: 14px;
        line-height: 1.6;
        color: #e4e9f5;
        text-shadow: 0 1px 2px rgba(0,0,0,1);
      }

      /* Highlighted update item */
      .update-item {
        margin-top: 10px;
        font-size: 12px;
        color: #57e5ff;
      }

      /* PROGRESS AREA */
      .launcher-ui-layer {
        width: 56%;
        display: flex; flex-direction: column;
        align-items: center;
        gap: 6px;
        margin-bottom: 18px;
        position: relative;
        z-index: 5;
      }

      .loading-label {
        font-family: 'Cinzel', serif;
        font-size: 14px;
        color: #62ecff;
        text-transform: uppercase;
        letter-spacing: 1px;
        text-shadow: 0 2px 4px rgba(0,0,0,0.9);
        margin-bottom: 2px;
      }

      .progress-container {
        width: 100%;
        height: 16px;
        background-color: rgba(10, 10, 10, 0.8);
        border: 1px solid #35d9ff;
        border-radius: 3px;
        overflow: hidden;
        box-shadow: 0 0 10px rgba(0,0,0,0.5);
      }

      .progress-bar {
        width: 0%; height: 100%;
        background: linear-gradient(90deg, #20d8ff 0%, #d936ff 55%, #ffcf45 100%);
        box-shadow: 0 0 15px rgba(55, 220, 255, 0.55);
        position: relative;
        transition: width 0.1s linear;
      }

      .progress-bar::after {
        content: ""; position: absolute; top:0; left:0; bottom:0; right:0;
        background-image: linear-gradient(-45deg, rgba(255,255,255,.1) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.1) 50%, rgba(255,255,255,.1) 75%, transparent 75%, transparent);
        background-size: 15px 15px;
        animation: moveStripe 0.8s linear infinite;
      }

      .status-text {
        font-family: 'Roboto', sans-serif;
        font-size: 10px;
        color: #999;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      @media screen and (max-width: 768px) and (orientation: portrait) {
        .loader-wrapper {
          --party-zone-loader-art: url('./png/party-zone-loader-mobile.webp');
        }

        .loader-content {
          width: min(94vw, calc(92dvh * 941 / 1672));
          max-height: 92dvh;
          aspect-ratio: 941 / 1672;
          padding-bottom: 18px;
        }

        .info-panel {
          top: 59%;
          width: 78%;
          min-height: 19%;
          padding: 10px 12px;
        }

        .info-title {
          font-size: clamp(16px, 4.6vw, 22px);
          margin-bottom: 6px;
        }

        .info-text {
          font-size: clamp(10px, 2.8vw, 13px);
          line-height: 1.4;
        }

        .update-item {
          margin-top: 6px;
          font-size: clamp(9px, 2.5vw, 12px);
        }

        .launcher-ui-layer {
          width: 76%;
          margin-bottom: 0;
          gap: 4px;
        }

        .loading-label {
          font-size: clamp(11px, 3vw, 14px);
        }

        .progress-container {
          height: 13px;
        }
      }

      @keyframes moveStripe { 0% { background-position: 0 0; } 100% { background-position: 15px 15px; } }
      @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
    `;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function createElement(tag, className, parent) {
    let el = document.createElement(tag);
    if (className) el.className = className;
    if (parent) parent.appendChild(el);
    return el;
  }

  function initLoader() {
    injectStyles();

    let loginWrapper = document.getElementById("login-wrapper");
    if (loginWrapper) loginWrapper.style.display = "none";

    let loader = createElement("div", "loader-wrapper", document.body);
    let content = createElement("div", "loader-content", loader);

    // --- INFO PANEL (Fills the black board in the middle) ---
    let infoPanel = createElement("div", "info-panel", content);

    let title = createElement("div", "info-title", infoPanel);
    title.innerText = "Welcome to CYRK'S PARTY ZONE";

    let text = createElement("div", "info-text", infoPanel);
    text.innerHTML = "DJ Thomas & DJ Hubertuse are warming up the dance floor!";

    let update = createElement("div", "update-item", infoPanel);
    update.innerText = "Tonight: great music, Floor is Lava and Bomberman";
    // ---------------------------------------------------------

    // UI Layer (Progress bar)
    let uiLayer = createElement("div", "launcher-ui-layer", content);
    let label = createElement("div", "loading-label", uiLayer);
    label.innerText = "Loading Party Zone...";

    let progressContainer = createElement("div", "progress-container", uiLayer);
    let progressBar = createElement("div", "progress-bar", progressContainer);

    let statusText = createElement("div", "status-text", uiLayer);
    statusText.innerText = "Initializing...";

    // Random simple tips
    const tips = [
      "Tip: Use /radio to join the party music.",
      "Tip: Stay off the hot tiles during Floor is Lava.",
      "Tip: Place bombs with /bomb during Bomberman.",
      "Tip: The bouncers control entry to the dance hall."
    ];
    // Rotate tip every few seconds? Or just show one randomized
    let randomTip = tips[Math.floor(Math.random() * tips.length)];
    text.innerHTML += `<br><br><span style='color: #888; font-size: 11px; font-style: italic;'>${randomTip}</span>`;

    return { loader, progressBar, statusText, loginWrapper, label, infoPanel };
  }

  const ui = initLoader();

  function loadNextScript(index) {
    if (index >= SCRIPTS.length) {
      ui.label.innerText = "Launching...";
      ui.statusText.innerText = "Done!";
      ui.progressBar.style.width = "100%";
      setTimeout(() => {
        ui.loader.style.opacity = "0";
        ui.loader.style.transition = "opacity 0.8s ease";
        setTimeout(() => {
          ui.loader.remove();
          if (ui.loginWrapper) ui.loginWrapper.style.display = "flex";
        }, 800);
      }, 500);
      return;
    }

    let src = SCRIPTS[index];
    let percent = Math.round(((index) / SCRIPTS.length) * 100);

    ui.progressBar.style.width = percent + "%";
    let filename = src.split('/').pop();
    ui.statusText.innerText = `Loading: ${filename}`;

    let script = document.createElement("script");
    script.src = src + "?v=" + encodeURIComponent(CLIENT_BUILD);
    script.onload = () => loadNextScript(index + 1);
    script.onerror = () => {
      console.error(`Failed: ${src}`);
      loadNextScript(index + 1);
    };
    document.body.appendChild(script);
  }

  // Do not initialize IndexedDB or start downloading Tibia.spr/Tibia.dat until
  // a pending Service Worker update has either taken control or been ruled out.
  // This makes the first launch after deploy behave exactly like later ones.
  let updateBarrier = window.__tibiaGoServiceWorkerReady || Promise.resolve();
  Promise.resolve(updateBarrier).catch(function (error) {
    console.warn("Client update barrier failed; continuing startup.", error);
  }).then(function () {
    loadNextScript(0);
  });

})();
