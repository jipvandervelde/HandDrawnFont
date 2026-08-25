(() => {
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const FILL_SELECTOR = [
    ".button--primary",
    ".button--light",
    ".code-card",
    ".pill--dark",
    ".wisdom-today",
    ".drawing-play",
    ".export-action--primary",
  ].join(",");
  const STATEFUL_FILL_SELECTOR = [
    ".segmented button",
    ".variation-thumbnail",
    ".export-action",
  ].join(",");
  const BOX_SELECTOR = [
    ".button",
    ".feature-card",
    ".code-card__bar button",
    ".font-card",
    ".font-card > a",
    ".wisdom-card",
    ".compiled-glyph",
    ".format-grid article",
    ".forge-app",
    ".preview-card",
    ".canvas-shell",
    ".add-dialog",
    ".pill",
    ".square-button:not(.square-button--thumb)",
    ".segmented",
    ".segmented button",
    ".glyph-tile",
    ".variation-thumbnail",
    ".drawing-actions button",
    ".export-action",
    ".project-file-actions button",
    ".file-button",
    ".rough-control-host",
  ].join(",");
  const CONTROL_SELECTOR = [
    'input:not([type="range"]):not([type="file"]):not([type="hidden"])',
    "select",
  ].join(",");
  const RANGE_SELECTOR = 'input[type="range"]';
  let installIndex = 0;

  function seedFor(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function randomFor(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function point(x, y) {
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  function roughSegment(x1, y1, x2, y2, random, intensity) {
    const deltaX = x2 - x1;
    const deltaY = y2 - y1;
    const length = Math.hypot(deltaX, deltaY);
    const count = Math.max(2, Math.ceil(length / 28));
    const normalX = length === 0 ? 0 : -deltaY / length;
    const normalY = length === 0 ? 0 : deltaX / length;
    const phase = random() * Math.PI * 2;
    const waves = 1.4 + random() * 1.8;
    let path = "";

    for (let index = 1; index <= count; index += 1) {
      const progress = index / count;
      const endpoint = index === count;
      const envelope = Math.sin(Math.PI * progress);
      const noise = endpoint ? 0 : (random() - 0.5) * 2 * intensity;
      const wave = endpoint
        ? 0
        : Math.sin(progress * Math.PI * 2 * waves + phase) * intensity * 0.28;
      const offset = (noise + wave) * envelope;
      const tangentJitter = endpoint ? 0 : (random() - 0.5) * intensity * 0.3;
      const tangentX = length === 0 ? 0 : (deltaX / length) * tangentJitter;
      const tangentY = length === 0 ? 0 : (deltaY / length) * tangentJitter;
      const x = x1 + deltaX * progress + normalX * offset + tangentX;
      const y = y1 + deltaY * progress + normalY * offset + tangentY;
      path += ` L ${point(x, y)}`;
    }

    return path;
  }

  function roughBoxPath(width, height, radius, seed, intensity) {
    const random = randomFor(seed);
    const edge = 2;
    const right = width - edge;
    const bottom = height - edge;
    const corner = Math.max(0, Math.min(radius, width / 2 - edge, height / 2 - edge));

    if (corner < 2) {
      return [
        `M ${point(edge, edge)}`,
        roughSegment(edge, edge, right, edge, random, intensity),
        roughSegment(right, edge, right, bottom, random, intensity),
        roughSegment(right, bottom, edge, bottom, random, intensity),
        roughSegment(edge, bottom, edge, edge, random, intensity),
        " Z",
      ].join("");
    }

    return [
      `M ${point(edge + corner, edge)}`,
      roughSegment(edge + corner, edge, right - corner, edge, random, intensity),
      ` Q ${point(right, edge)} ${point(right, edge + corner)}`,
      roughSegment(right, edge + corner, right, bottom - corner, random, intensity),
      ` Q ${point(right, bottom)} ${point(right - corner, bottom)}`,
      roughSegment(right - corner, bottom, edge + corner, bottom, random, intensity),
      ` Q ${point(edge, bottom)} ${point(edge, bottom - corner)}`,
      roughSegment(edge, bottom - corner, edge, edge + corner, random, intensity),
      ` Q ${point(edge, edge)} ${point(edge + corner, edge)}`,
      " Z",
    ].join("");
  }

  function makePath(className) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("class", className);
    return path;
  }

  function makeSVG(className) {
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("preserveAspectRatio", "none");
    return svg;
  }

  function elementIdentity(element, index) {
    const dataAttribute = [...element.attributes].find(
      (attribute) => attribute.name.startsWith("data-") && attribute.value,
    );
    return (
      element.getAttribute("aria-label") ||
      element.id ||
      (dataAttribute ? `${dataAttribute.name}:${dataAttribute.value}` : "") ||
      element.textContent?.trim().slice(0, 80) ||
      `${element.className}:${index}`
    );
  }

  function installBox(element, index) {
    if (element.dataset.roughEdgeInstalled === "true") return;
    element.dataset.roughEdgeInstalled = "true";
    const svg = makeSVG("rough-edge-overlay");
    const mainPath = makePath("rough-edge__stroke rough-edge__stroke--main");
    const echoPath = makePath("rough-edge__stroke rough-edge__stroke--echo");
    const seed = seedFor(`${location.pathname}:${elementIdentity(element, index)}`);
    if (element.matches(".variation-thumbnail--add")) {
      svg.classList.add("rough-edge-overlay--dashed");
    }
    svg.append(mainPath, echoPath);
    element.append(svg);
    element.classList.add("rough-edge-host");

    const draw = () => {
      const rectangle = element.getBoundingClientRect();
      const width = Math.max(8, rectangle.width + 4);
      const height = Math.max(8, rectangle.height + 4);
      const styles = getComputedStyle(element);
      const radius = Number.parseFloat(styles.borderTopLeftRadius) || 0;
      const intensity =
        Number.parseFloat(styles.getPropertyValue("--rough-edge-intensity")) || 1.15;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      mainPath.setAttribute("d", roughBoxPath(width, height, radius, seed, intensity));
      echoPath.setAttribute(
        "d",
        roughBoxPath(width, height, radius, seed + 101, intensity * 0.61),
      );
    };

    draw();
    new ResizeObserver(draw).observe(element);
  }

  function installFill(element, index) {
    if (element.dataset.roughFillInstalled === "true") return;
    element.dataset.roughFillInstalled = "true";
    const svg = makeSVG("rough-fill-overlay");
    const shape = makePath("rough-fill__shape");
    const seed = seedFor(`${location.pathname}:fill:${elementIdentity(element, index)}`);
    svg.append(shape);
    element.append(svg);
    element.classList.add("rough-fill-host");

    const draw = () => {
      const rectangle = element.getBoundingClientRect();
      const width = Math.max(8, rectangle.width);
      const height = Math.max(8, rectangle.height);
      const styles = getComputedStyle(element);
      const radius = Number.parseFloat(styles.borderTopLeftRadius) || 0;
      const intensity =
        Number.parseFloat(styles.getPropertyValue("--rough-edge-intensity")) || 1.45;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      shape.setAttribute("d", roughBoxPath(width, height, radius, seed, intensity));
    };

    draw();
    new ResizeObserver(draw).observe(element);
  }

  function installBottomLine(element, index) {
    if (element.dataset.roughLineInstalled === "true") return;
    element.dataset.roughLineInstalled = "true";
    const svg = makeSVG("rough-edge-line-overlay");
    const mainPath = makePath("rough-edge__stroke rough-edge__stroke--main");
    const echoPath = makePath("rough-edge__stroke rough-edge__stroke--echo");
    const seed = seedFor(`${location.pathname}:line:${element.className}:${index}`);
    svg.append(mainPath, echoPath);
    element.append(svg);
    element.classList.add("rough-edge-line-host");

    const draw = () => {
      const width = Math.max(8, element.getBoundingClientRect().width + 4);
      svg.setAttribute("viewBox", `0 0 ${width} 6`);
      mainPath.setAttribute("d", `M 2 3${roughSegment(2, 3, width - 2, 3, randomFor(seed), 1.05)}`);
      echoPath.setAttribute("d", `M 2 3${roughSegment(2, 3, width - 2, 3, randomFor(seed + 101), 0.65)}`);
    };

    draw();
    new ResizeObserver(draw).observe(element);
  }

  function installControl(control, index) {
    if (control.dataset.roughControlInstalled === "true") return;
    control.dataset.roughControlInstalled = "true";
    const wrapper = document.createElement("span");
    wrapper.className = "rough-control-host";
    wrapper.dataset.roughIdentity = elementIdentity(control, index);
    control.before(wrapper);
    wrapper.append(control);
    installBox(wrapper, index);
  }

  function installRange(input, index) {
    if (input.dataset.roughRangeInstalled === "true") return;
    input.dataset.roughRangeInstalled = "true";
    const wrapper = document.createElement("span");
    wrapper.className = "rough-range-host";
    const svg = makeSVG("rough-range-overlay");
    const mainPath = makePath("rough-edge__stroke rough-edge__stroke--main");
    const echoPath = makePath("rough-edge__stroke rough-edge__stroke--echo");
    const seed = seedFor(`${location.pathname}:range:${elementIdentity(input, index)}`);
    svg.append(mainPath, echoPath);
    input.before(wrapper);
    wrapper.append(input, svg);

    const draw = () => {
      const width = Math.max(24, wrapper.getBoundingClientRect().width);
      svg.setAttribute("viewBox", `0 0 ${width} 20`);
      mainPath.setAttribute(
        "d",
        `M 9 10${roughSegment(9, 10, width - 9, 10, randomFor(seed), 1.15)}`,
      );
      echoPath.setAttribute(
        "d",
        `M 9 10${roughSegment(9, 10, width - 9, 10, randomFor(seed + 101), 0.7)}`,
      );
    };

    draw();
    new ResizeObserver(draw).observe(wrapper);
  }

  function matchingElements(root, selector) {
    const matches = root instanceof Element && root.matches(selector) ? [root] : [];
    return [...matches, ...(root.querySelectorAll?.(selector) ?? [])];
  }

  function installWithin(root) {
    for (const control of matchingElements(root, CONTROL_SELECTOR)) {
      installControl(control, installIndex++);
    }
    for (const range of matchingElements(root, RANGE_SELECTOR)) {
      installRange(range, installIndex++);
    }
    for (const element of matchingElements(root, FILL_SELECTOR)) {
      installFill(element, installIndex++);
    }
    for (const element of matchingElements(root, STATEFUL_FILL_SELECTOR)) {
      installFill(element, installIndex++);
    }
    for (const element of matchingElements(root, BOX_SELECTOR)) {
      if (element.matches(FILL_SELECTOR)) continue;
      installBox(element, installIndex++);
    }
    for (const element of matchingElements(root, ".code-card__bar")) {
      installBottomLine(element, installIndex++);
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    installWithin(document);
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) installWithin(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
