import {
  drawAnimatedPreviewFrame,
  fontBaselineOffset,
  makeAnimatedPreviewPlan,
} from "./create/animated-preview.mjs";

const PROJECT_URL = "/create/grug-hand-project.json";
const MANIFEST_URL = "/create/grug-hand-manifest.json";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FAIL_SAFE_DELAY = 7000;

const root = document.documentElement;
const title = document.querySelector(".home-title");
const staticTitle = document.querySelector("[data-home-title-static]");
const staticTitleLines = document.querySelectorAll("[data-home-title-line]");
const canvas = document.querySelector("[data-home-title-canvas]");
const revealTargets = document.querySelectorAll("[data-home-after-intro]");
const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);

let animationFrame = 0;
let failSafe = window.__homeIntroFailSafe || 0;
let finished = false;

function setRevealTargetsInert(inert) {
  for (const target of revealTargets) target.inert = inert;
}

function finishIntro() {
  if (finished) return;
  finished = true;
  window.cancelAnimationFrame(animationFrame);
  window.clearTimeout(failSafe);
  setRevealTargetsInert(false);
  root.classList.remove("home-intro-pending");
  root.classList.add("home-intro-complete");
  root.dataset.homeIntro = "complete";
}

function prepareCanvas(target) {
  const titleRect = title.getBoundingClientRect();
  const staticTitleRect = staticTitle.getBoundingClientRect();
  target.style.inset = "auto";
  target.style.left = `${staticTitleRect.left - titleRect.left}px`;
  target.style.top = `${staticTitleRect.top - titleRect.top}px`;
  target.style.width = `${staticTitleRect.width}px`;
  target.style.height = `${staticTitleRect.height}px`;

  const rect = target.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  target.width = Math.round(width * ratio);
  target.height = Math.round(height * ratio);
  const context = target.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, height, width };
}

async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return response.json();
}

async function playIntro() {
  if (!title || !staticTitle || !canvas || reducedMotion.matches) {
    finishIntro();
    return;
  }

  setRevealTargetsInert(true);
  root.dataset.homeIntro = "loading";
  if (!failSafe) failSafe = window.setTimeout(finishIntro, FAIL_SAFE_DELAY);

  try {
    const [project, manifest] = await Promise.all([
      loadJSON(PROJECT_URL),
      loadJSON(MANIFEST_URL),
      document.fonts?.load('400 90px "Grug Hand"') ?? Promise.resolve(),
    ]);

    if (finished || reducedMotion.matches) {
      finishIntro();
      return;
    }

    const style = getComputedStyle(staticTitle);
    const fontSize = Number.parseFloat(style.fontSize) || 90;
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.02;
    const { context, height, width } = prepareCanvas(canvas);
    const animatedTitle = Array.from(staticTitleLines, (line) => line.textContent.trim()).join(
      "\n",
    );
    const baselineOffset = fontBaselineOffset({
      ascent: manifest.ascent,
      descent: manifest.descent,
      fontSize,
      lineHeight,
      unitsPerEm: manifest.unitsPerEm,
    });
    const plan = makeAnimatedPreviewPlan(project, animatedTitle, {
      baselineOffset,
      fontSize,
      lineHeight,
      width,
    });

    context.lineCap = manifest.strokeLinecap === "butt" ? "butt" : "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(
      1,
      ((Number(project.fontForge?.strokeWidth) || 60) / 1000) * fontSize,
    );
    root.dataset.homeIntro = "playing";

    const startedAt = performance.now();
    function drawFrame(now) {
      if (finished || reducedMotion.matches) {
        finishIntro();
        return;
      }

      const elapsed = Math.min(now - startedAt, plan.totalDuration);
      context.clearRect(0, 0, width, height);
      context.strokeStyle = getComputedStyle(root).getPropertyValue("--ink").trim();
      drawAnimatedPreviewFrame(context, plan, elapsed);

      if (elapsed < plan.totalDuration) {
        animationFrame = window.requestAnimationFrame(drawFrame);
      } else {
        animationFrame = window.requestAnimationFrame(finishIntro);
      }
    }

    animationFrame = window.requestAnimationFrame(drawFrame);
  } catch (error) {
    console.error("Homepage title animation could not start.", error);
    finishIntro();
  }
}

reducedMotion.addEventListener("change", ({ matches }) => {
  if (matches) finishIntro();
});

playIntro();
