import { checkPreposition } from "./predlogi-sz.js";

// "h" before g and k sounds, otherwise "k".
export function checkKH(text) {
  return checkPreposition(text, "kh", function (sound) {
    return sound === "g" || sound === "k" ? "h" : "k";
  });
}
