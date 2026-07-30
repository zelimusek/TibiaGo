const CLIENT_VERSION = "0.0.1";
const SERVER_VERSION = "760";

function initializeGameClient() {

  /*
   * Function initializeGameClient
   * Creates the client exactly once after all dynamically loaded source files
   * are available. On a fast desktop browser the native load event may have
   * already fired before launcher.js reaches this final script.
   */

  if (window.gameClient) {
    return;
  }

  // Create the game client class and attach it to the window
  window.gameClient = new GameClient();

  // Initialize chat resizer
  new ChatResizer();

}

function initializeDocumentState() {

  /*
   * Function initializeDocumentState
   * Applies the initial UI state whether DOMContentLoaded is still pending or
   * has already happened while launcher.js was loading the source graph.
   */

  let enterGame = document.getElementById("enter-game");
  if (enterGame) {
    enterGame.disabled = true;
  }

}

if (document.readyState === "complete") {
  initializeGameClient();
} else {
  window.addEventListener("load", initializeGameClient, { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeDocumentState, { once: true });
} else {
  initializeDocumentState();
}
