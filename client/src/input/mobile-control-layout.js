"use strict";

/**
 * Manages movable touch controls without changing their normal tap actions.
 * Positions are stored as viewport-relative values for portrait and landscape
 * separately, so a layout remains usable after a rotation or resolution change.
 */
const MobileControlLayout = function () {

  this.STORAGE_KEY = "mobile-control-layout-v1";
  this.LONG_PRESS_DURATION = 500;
  this.MOVE_THRESHOLD = 8;
  this.VIEWPORT_PADDING = 4;

  this.__controls = new Map();
  this.__active = null;
  this.__resizeTimer = null;

  this.__scheduleRestoreBound = this.__scheduleRestore.bind(this);
  window.addEventListener("resize", this.__scheduleRestoreBound);
  window.addEventListener("orientationchange", this.__scheduleRestoreBound);

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", this.__scheduleRestoreBound);
  }

};

MobileControlLayout.prototype.register = function (element, key, callbacks) {

  if (!element) {
    return;
  }

  let existing = this.__controls.get(key);

  if (existing && existing.element === element) {
    existing.callbacks = callbacks || new Object();
    this.__restoreControl(existing);
    return;
  }

  let control = {
    element: element,
    key: key,
    callbacks: callbacks || new Object()
  };

  control.start = this.__handleStart.bind(this, control);
  control.move = this.__handleMove.bind(this, control);
  control.end = this.__handleEnd.bind(this, control, false);
  control.cancel = this.__handleEnd.bind(this, control, true);

  element.classList.add("mobile-layout-control");
  element.addEventListener("touchstart", control.start, { passive: false });
  element.addEventListener("touchmove", control.move, { passive: false });
  element.addEventListener("touchend", control.end, { passive: false });
  element.addEventListener("touchcancel", control.cancel, { passive: false });

  this.__controls.set(key, control);
  this.__restoreControl(control);

};

MobileControlLayout.prototype.reset = function () {

  localStorage.removeItem(this.STORAGE_KEY);

  this.__controls.forEach(function (control) {
    this.__clearPosition(control);
    control.element.classList.remove("mobile-control-held", "mobile-control-dragging");
  }, this);

  if (navigator.vibrate) {
    navigator.vibrate([25, 30, 25]);
  }

};

MobileControlLayout.prototype.__handleStart = function (control, event) {

  if (event.touches.length !== 1 || this.__active !== null) {
    return;
  }

  let touch = event.changedTouches[0];

  event.preventDefault();
  event.stopPropagation();

  let gesture = {
    control: control,
    identifier: touch.identifier,
    target: event.target,
    startX: touch.clientX,
    startY: touch.clientY,
    longPressed: false,
    dragging: false,
    cancelled: false,
    timer: null,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    baseRect: null
  };

  gesture.timer = setTimeout(function () {
    this.__beginLongPress(gesture);
  }.bind(this), this.LONG_PRESS_DURATION);

  this.__active = gesture;

};

MobileControlLayout.prototype.__beginLongPress = function (gesture) {

  if (this.__active !== gesture || gesture.cancelled) {
    return;
  }

  let rect = gesture.control.element.getBoundingClientRect();

  gesture.longPressed = true;
  gesture.pointerOffsetX = gesture.startX - rect.left;
  gesture.pointerOffsetY = gesture.startY - rect.top;
  gesture.baseRect = this.__getBaseRect(gesture.control);

  gesture.control.element.classList.add("mobile-control-held");

  if (navigator.vibrate) {
    navigator.vibrate(35);
  }

};

MobileControlLayout.prototype.__handleMove = function (control, event) {

  let gesture = this.__active;

  if (!gesture || gesture.control !== control) {
    return;
  }

  let touch = this.__findTouch(event.touches, gesture.identifier);

  if (!touch) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  let dx = touch.clientX - gesture.startX;
  let dy = touch.clientY - gesture.startY;
  let distance = Math.sqrt(dx * dx + dy * dy);

  if (!gesture.longPressed) {
    if (distance > this.MOVE_THRESHOLD) {
      clearTimeout(gesture.timer);
      gesture.cancelled = true;
    }
    return;
  }

  if (distance <= this.MOVE_THRESHOLD && !gesture.dragging) {
    return;
  }

  gesture.dragging = true;
  control.element.classList.add("mobile-control-dragging");

  let viewport = this.__getViewport();
  let rect = control.element.getBoundingClientRect();
  let left = touch.clientX - gesture.pointerOffsetX;
  let top = touch.clientY - gesture.pointerOffsetY;

  left = Math.max(
    viewport.left + this.VIEWPORT_PADDING,
    Math.min(left, viewport.left + viewport.width - rect.width - this.VIEWPORT_PADDING)
  );
  top = Math.max(
    viewport.top + this.VIEWPORT_PADDING,
    Math.min(top, viewport.top + viewport.height - rect.height - this.VIEWPORT_PADDING)
  );

  this.__setPosition(control, left, top, gesture.baseRect);

};

MobileControlLayout.prototype.__handleEnd = function (control, cancelled, event) {

  let gesture = this.__active;

  if (!gesture || gesture.control !== control) {
    return;
  }

  let touch = this.__findTouch(event.changedTouches, gesture.identifier);

  if (!touch) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  clearTimeout(gesture.timer);

  control.element.classList.remove("mobile-control-held", "mobile-control-dragging");
  this.__active = null;

  if (cancelled) {
    return;
  }

  if (gesture.dragging) {
    this.__saveControl(control);
    return;
  }

  if (gesture.longPressed) {
    if (typeof control.callbacks.onLongPress === "function") {
      control.callbacks.onLongPress(event, gesture.target);
    }
    return;
  }

  if (!gesture.cancelled && typeof control.callbacks.onTap === "function") {
    control.callbacks.onTap(event, gesture.target);
  }

};

MobileControlLayout.prototype.__setPosition = function (control, left, top, baseRect) {

  baseRect = baseRect || this.__getBaseRect(control);

  control.element.style.setProperty("--mobile-control-x", (left - baseRect.left) + "px");
  control.element.style.setProperty("--mobile-control-y", (top - baseRect.top) + "px");
  control.element.classList.add("mobile-control-positioned");

};

MobileControlLayout.prototype.__saveControl = function (control) {

  let state = this.__loadState();
  let orientation = this.__getOrientation();
  let viewport = this.__getViewport();
  let rect = control.element.getBoundingClientRect();
  let width = Math.max(1, viewport.width - rect.width - (2 * this.VIEWPORT_PADDING));
  let height = Math.max(1, viewport.height - rect.height - (2 * this.VIEWPORT_PADDING));

  if (!state[orientation]) {
    state[orientation] = new Object();
  }

  state[orientation][control.key] = {
    x: this.__clamp01((rect.left - viewport.left - this.VIEWPORT_PADDING) / width),
    y: this.__clamp01((rect.top - viewport.top - this.VIEWPORT_PADDING) / height)
  };

  localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));

};

MobileControlLayout.prototype.__restoreControl = function (control) {

  let state = this.__loadState();
  let orientation = this.__getOrientation();
  let saved = state[orientation] ? state[orientation][control.key] : null;

  if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) {
    this.__clearPosition(control);
    return;
  }

  this.__clearPosition(control);

  let viewport = this.__getViewport();
  let baseRect = control.element.getBoundingClientRect();
  let width = Math.max(0, viewport.width - baseRect.width - (2 * this.VIEWPORT_PADDING));
  let height = Math.max(0, viewport.height - baseRect.height - (2 * this.VIEWPORT_PADDING));
  let left = viewport.left + this.VIEWPORT_PADDING + this.__clamp01(saved.x) * width;
  let top = viewport.top + this.VIEWPORT_PADDING + this.__clamp01(saved.y) * height;

  this.__setPosition(control, left, top, baseRect);

};

MobileControlLayout.prototype.__scheduleRestore = function () {

  clearTimeout(this.__resizeTimer);
  this.__resizeTimer = setTimeout(function () {
    this.__controls.forEach(this.__restoreControl.bind(this));
  }.bind(this), 120);

};

MobileControlLayout.prototype.__getBaseRect = function (control) {

  let positioned = control.element.classList.contains("mobile-control-positioned");

  if (positioned) {
    control.element.classList.remove("mobile-control-positioned");
  }

  let rect = control.element.getBoundingClientRect();

  if (positioned) {
    control.element.classList.add("mobile-control-positioned");
  }

  return rect;

};

MobileControlLayout.prototype.__clearPosition = function (control) {

  control.element.classList.remove("mobile-control-positioned");
  control.element.style.removeProperty("--mobile-control-x");
  control.element.style.removeProperty("--mobile-control-y");

};

MobileControlLayout.prototype.__loadState = function () {

  try {
    let value = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? value : new Object();
  } catch (error) {
    return new Object();
  }

};

MobileControlLayout.prototype.__getOrientation = function () {

  return window.innerHeight > window.innerWidth ? "portrait" : "landscape";

};

MobileControlLayout.prototype.__getViewport = function () {

  if (window.visualViewport) {
    return {
      left: window.visualViewport.offsetLeft || 0,
      top: window.visualViewport.offsetTop || 0,
      width: window.visualViewport.width,
      height: window.visualViewport.height
    };
  }

  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight
  };

};

MobileControlLayout.prototype.__findTouch = function (touches, identifier) {

  for (let i = 0; i < touches.length; i++) {
    if (touches[i].identifier === identifier) {
      return touches[i];
    }
  }

  return null;

};

MobileControlLayout.prototype.__clamp01 = function (value) {

  return Math.max(0, Math.min(1, Number(value) || 0));

};
