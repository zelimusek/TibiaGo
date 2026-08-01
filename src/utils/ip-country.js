"use strict";

let geoip = null;

const normalizeIPAddress = function (value) {
  let address = String(value || "").split(",")[0].trim();
  if (address.startsWith("::ffff:")) {
    address = address.slice(7);
  }
  if (address.startsWith("[") && address.includes("]")) {
    address = address.slice(1, address.indexOf("]"));
  }
  return address;
};

const getRequestIPAddress = function (request, socket) {
  let headers = request && request.headers ? request.headers : {};
  return normalizeIPAddress(
    headers["cf-connecting-ip"]
      || headers["x-real-ip"]
      || headers["x-forwarded-for"]
      || (socket && socket._socket && socket._socket.remoteAddress)
      || (socket && socket.remoteAddress)
      || ""
  );
};

const getCountryCode = function (address, request) {
  let headers = request && request.headers ? request.headers : {};
  let forwardedCountry = String(headers["cf-ipcountry"] || "").toUpperCase();
  if (/^[A-Z]{2}$/.test(forwardedCountry) && forwardedCountry !== "XX") {
    return forwardedCountry;
  }

  // Most production requests already carry Cloudflare's country header. Load
  // the larger local database only as a fallback so it does not consume game
  // server memory unnecessarily.
  if (geoip === null) {
    geoip = require("geoip-lite");
  }
  let match = geoip.lookup(normalizeIPAddress(address));
  return match && typeof match.country === "string"
    ? match.country.toUpperCase()
    : null;
};

module.exports = {
  normalizeIPAddress,
  getRequestIPAddress,
  getCountryCode
};
