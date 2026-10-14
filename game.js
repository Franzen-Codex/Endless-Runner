(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const loadingScreen = document.querySelector("#loading-screen");
  const titleScreen = document.querySelector("#title-screen");
  const settingsScreen = document.querySelector("#settings-screen");
  const gameScreen = document.querySelector("#game-screen");
  const loadingBar = document.querySelector("#loading-bar");
  const loadingLabel = document.querySelector("#loading-label");
  const titlePlay = document.querySelector("#title-play");
  const titleSettings = document.querySelector("#title-settings");
  const settingsBack = document.querySelector("#settings-back");
  const gameMenu = document.querySelector("#game-menu");
  const headUpload = document.querySelector("#head-upload");
  const titleHeadPreview = document.querySelector("#title-head-preview");
  const headPreview = document.querySelector("#head-preview");
  const uploadStatus = document.querySelector("#upload-status");
  const resetHead = document.querySelector("#reset-head");
  const cropDialog = document.querySelector("#head-crop-dialog");
  const cropCanvas = document.querySelector("#crop-canvas");
  const cropContext = cropCanvas.getContext("2d");
  const cropZoom = document.querySelector("#crop-zoom");
  const zoomValue = document.querySelector("#zoom-value");
  const cropCancel = document.querySelector("#crop-cancel");
  const cropApply = document.querySelector("#crop-apply");
  const overlay = document.querySelector("#overlay");
  const playButton = document.querySelector("#play-button");
  const buttonLabel = document.querySelector("#button-label");
  const overlayKicker = document.querySelector("#overlay-kicker");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayCopy = document.querySelector("#overlay-copy");
  const scoreElement = document.querySelector("#score");
  const bestElement = document.querySelector("#best-score");
  const headImage = new Image();
  const defaultHeadSrc = "head.svg";
  let savedHead = localStorage.getItem("headlong-custom-head");
  headImage.src = savedHead || defaultHeadSrc;
  titleHeadPreview.src = savedHead || defaultHeadSrc;
  headPreview.src = savedHead || defaultHeadSrc;

  const W = 960;
  const H = 440;
  const GROUND = 354;
  const runner = { x: 146, y: GROUND, vy: 0, grounded: true, ducking: false };
  const obstacles = [];
  const particles = [];
  const clouds = [
    { x: 90, y: 91, s: .8 }, { x: 389, y: 59, s: 1.05 },
    { x: 693, y: 108, s: .72 }, { x: 890, y: 55, s: .88 }
  ];
  const colors = {
    sky: "#dce7e8", skyShade: "#c9d9db", ink: "#202b35", softInk: "#58666d",
    lime: "#b2df57", ground: "#e8e8d9", coral: "#ed8066", blue: "#648b9b"
  };
  let state = "loading";
  let lastTime = 0;
  let elapsed = 0;
  let distance = 0;
  let speed = 360;
  let spawnIn = 1.4;
  let frame = 0;
  let best = Number(localStorage.getItem("headlong-best") || 0);
  let scale = 1;
  let pixelRatio = 1;
  let loadingProgress = 0;
  let loadingTimer;
  let loadingFinished = false;
  let pendingCropImage = null;
  let cropCenterX = 0;
  let cropCenterY = 0;
  let cropDragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  bestElement.textContent = formatScore(best);

  function formatScore(value) {
    return Math.floor(value).toString().padStart(5, "0");
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * pixelRatio);
    canvas.height = Math.round(rect.height * pixelRatio);
    scale = rect.width / W;
    ctx.setTransform(pixelRatio * scale, 0, 0, pixelRatio * scale, 0, 0);
    draw();
  }

  function showScreen(screen) {
    for (const candidate of [loadingScreen, titleScreen, settingsScreen, gameScreen]) {
      candidate.classList.toggle("is-hidden", candidate !== screen);
    }
  }

  function setLoadingProgress(value) {
    loadingProgress = Math.min(100, Math.floor(value));
    loadingBar.style.width = `${loadingProgress}%`;
    loadingBar.parentElement.setAttribute("aria-valuenow", String(loadingProgress));
    loadingLabel.innerHTML = `LOADING <span>${String(loadingProgress).padStart(2, "0")}%</span>`;
  }

  function finishLoading() {
    if (loadingFinished) return;
    loadingFinished = true;
    clearInterval(loadingTimer);
    setLoadingProgress(100);
    window.setTimeout(() => {
      state = "ready";
      showScreen(titleScreen);
    }, 300);
  }

  function launchGame() {
    state = "ready";
    showScreen(gameScreen);
    resize();
    start();
  }

  function returnToTitle() {
    state = "menu";
    runner.ducking = false;
    showScreen(titleScreen);
  }

  function loadCustomHead(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      uploadStatus.textContent = "Please choose a valid image file.";
      headUpload.value = "";
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("error", () => {
      uploadStatus.textContent = "Could not read that image. Please try another file.";
      headUpload.value = "";
    }, { once: true });
    reader.addEventListener("load", () => {
      const importedImage = new Image();
      importedImage.addEventListener("error", () => {
        uploadStatus.textContent = "Could not open that image. Please try another file.";
        headUpload.value = "";
      }, { once: true });
      importedImage.addEventListener("load", () => {
        pendingCropImage = importedImage;
        cropCenterX = importedImage.naturalWidth / 2;
        cropCenterY = importedImage.naturalHeight / 2;
        cropZoom.value = "1";
        updateCropPreview();
        uploadStatus.textContent = "Position and zoom your image, then apply the crop.";
        cropDialog.showModal();
      }, { once: true });
      importedImage.src = String(reader.result);
    }, { once: true });
    reader.readAsDataURL(file);
  }

  function getCropSide() {
    if (!pendingCropImage) return 0;
    return Math.min(pendingCropImage.naturalWidth, pendingCropImage.naturalHeight) /
      Number(cropZoom.value);
  }

  function clampCropCenter() {
    const side = getCropSide();
    if (!side) return;
    cropCenterX = Math.max(side / 2, Math.min(pendingCropImage.naturalWidth - side / 2, cropCenterX));
    cropCenterY = Math.max(side / 2, Math.min(pendingCropImage.naturalHeight - side / 2, cropCenterY));
  }

  function updateCropPreview() {
    if (!pendingCropImage) return;
    clampCropCenter();
    const side = getCropSide();
    cropContext.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropContext.drawImage(
      pendingCropImage,
      cropCenterX - side / 2, cropCenterY - side / 2, side, side,
      0, 0, cropCanvas.width, cropCanvas.height
    );
    zoomValue.textContent = `${Number(cropZoom.value).toFixed(1)}×`;
  }

  function closeCrop(cancelled) {
    if (cropDialog.open) cropDialog.close();
    pendingCropImage = null;
    cropDragging = false;
    headUpload.value = "";
    if (cancelled) uploadStatus.textContent = "Crop canceled. Your current head is unchanged.";
  }

  function applyCrop() {
    if (!pendingCropImage) return;
    const side = getCropSide();
    const resultCanvas = document.createElement("canvas");
    resultCanvas.width = 256;
    resultCanvas.height = 256;
    const resultContext = resultCanvas.getContext("2d");
    if (!resultContext) {
      uploadStatus.textContent = "Could not crop that image. Please try another file.";
      console.error("Could not create a canvas context for the cropped head.");
      closeCrop(false);
      return;
    }

    try {
      resultContext.drawImage(
        pendingCropImage,
        cropCenterX - side / 2, cropCenterY - side / 2, side, side,
        0, 0, resultCanvas.width, resultCanvas.height
      );
      const imageData = resultCanvas.toDataURL("image/png");
      headImage.src = imageData;
      titleHeadPreview.src = imageData;
      headPreview.src = imageData;
      savedHead = imageData;
      try {
        localStorage.setItem("headlong-custom-head", imageData);
        uploadStatus.textContent = "Custom head cropped, applied, and saved on this device.";
      } catch (error) {
        uploadStatus.textContent = "Custom head cropped and applied, but could not be saved for next time.";
        console.error("Could not save the custom head in local storage.", error);
      }
      closeCrop(false);
      draw();
    } catch (error) {
      uploadStatus.textContent = "Could not crop that image. Please try another file.";
      console.error("Could not create the cropped head image.", error);
      closeCrop(false);
    }
  }

  function start() {
    if (state === "running" || state === "loading" || state === "menu") return;
    if (state === "over") {
      obstacles.length = 0;
      particles.length = 0;
      distance = 0;
      speed = 360;
      spawnIn = 1.4;
      runner.y = GROUND;
      runner.vy = 0;
      runner.grounded = true;
      runner.ducking = false;
      scoreElement.textContent = formatScore(0);
    }
    state = "running";
    elapsed = 0;
    lastTime = performance.now();
    overlay.classList.add("is-hidden");
    requestAnimationFrame(loop);
  }

  function finish() {
    state = "over";
    const score = Math.floor(distance);
    const newBest = score > best;
    if (newBest) {
      best = score;
      localStorage.setItem("headlong-best", String(best));
      bestElement.textContent = formatScore(best);
    }
    overlayKicker.textContent = newBest ? "NEW PERSONAL BEST" : "THAT WAS A GOOD RUN";
    overlayTitle.innerHTML = newBest ? "Look at<br>you go." : "One more<br>time?";
    overlayCopy.textContent = `You made it ${formatScore(score)} metres. The road goes on.`;
    buttonLabel.textContent = "Run it back";
    overlay.classList.remove("is-hidden");
    burst(runner.x + 32, runner.y - 26, colors.coral, 13);
    draw();
  }

  function jump() {
    if (state !== "running") {
      start();
      if (state !== "running") return;
    }
    if (!runner.grounded) return;
    runner.vy = -690;
    runner.grounded = false;
    runner.ducking = false;
    burst(runner.x + 20, GROUND - 3, "#fffdf0", 5);
  }

  function setDuck(value) {
    if (state !== "running") return;
    runner.ducking = value;
    if (value && !runner.grounded) runner.vy = Math.max(runner.vy, 1100);
  }

  function addObstacle() {
    const roll = Math.random();
    if (roll < .36) {
      obstacles.push({ type: "cone", x: W + 35, w: 37, h: 43, color: colors.coral });
    } else if (roll < .69) {
      obstacles.push({ type: "block", x: W + 35, w: 49, h: 62, color: colors.blue });
    } else {
      obstacles.push({ type: "overhead", x: W + 35, w: 83, h: 37, color: colors.ink });
    }
  }

  function loop(now) {
    if (state !== "running") return;
    const dt = Math.min((now - lastTime) / 1000, .033);
    lastTime = now;
    elapsed += dt;
    frame += dt * 11;
    distance += dt * speed * .055;
    speed = Math.min(660, 360 + distance * .36);
    runner.vy += 1800 * dt;
    runner.y += runner.vy * dt;
    if (runner.y >= GROUND) {
      runner.y = GROUND;
      runner.vy = 0;
      runner.grounded = true;
    }

    spawnIn -= dt;
    if (spawnIn <= 0) {
      addObstacle();
      spawnIn = Math.max(.85, 1.48 + Math.random() * .62 - (speed - 360) / 600);
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obstacle = obstacles[i];
      obstacle.x -= speed * dt;
      if (obstacle.x + obstacle.w < -10) obstacles.splice(i, 1);
      else if (collides(obstacle)) {
        finish();
        return;
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 520 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    scoreElement.textContent = formatScore(distance);
    draw();
    requestAnimationFrame(loop);
  }

  function collides(obstacle) {
    const ducking = runner.ducking;
    const left = runner.x + (ducking ? 18 : 14);
    const right = runner.x + (ducking ? 72 : 67);
    const top = runner.y - (ducking ? 54 : 85);
    const bottom = runner.y - 3;
    const obstacleTop = obstacle.type === "overhead" ? GROUND - 94 : GROUND - obstacle.h;
    const obstacleBottom = obstacle.type === "overhead" ? GROUND - 57 : GROUND;
    return right > obstacle.x + 4 && left < obstacle.x + obstacle.w - 4 &&
      bottom > obstacleTop + 3 && top < obstacleBottom - 2;
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const force = 35 + Math.random() * 125;
      particles.push({
        x, y, vx: Math.cos(angle) * force, vy: Math.sin(angle) * force - 25,
        life: .25 + Math.random() * .4, maxLife: .65, size: 2 + Math.random() * 4, color
      });
    }
  }

  function draw() {
    if (!ctx || !canvas.width) return;
    ctx.clearRect(0, 0, W, H);
    drawBackdrop();
    drawGround();
    for (const obstacle of obstacles) drawObstacle(obstacle);
    drawRunner();
    drawParticles();
  }

  function drawBackdrop() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, colors.sky);
    sky.addColorStop(1, colors.skyShade);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255, 255, 255, .42)";
    ctx.beginPath();
    ctx.arc(778, 96, 47, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, .78)";
    ctx.beginPath();
    ctx.arc(778, 96, 30, 0, Math.PI * 2);
    ctx.fill();

    for (const cloud of clouds) drawCloud(cloud);
    const travel = (state === "running" ? distance * 2.2 : 0) % 380;
    drawHill(-travel, 273, 130, 37, "#c5d8d6");
    drawHill(235 - travel, 292, 170, 48, "#bfd2d0");
    drawHill(585 - travel, 273, 150, 37, "#c5d8d6");
    drawHill(935 - travel, 292, 170, 48, "#bfd2d0");
    drawHill(128 - (travel * .55) % 500, 325, 220, 48, "#acc5c3");
    drawHill(590 - (travel * .55) % 500, 326, 260, 53, "#acc5c3");
  }

  function drawCloud(cloud) {
    const offset = state === "running" ? (distance * .12) % 1150 : Math.sin(elapsed + cloud.x) * 3;
    let x = cloud.x - offset;
    if (x < -90) x += 1150;
    ctx.fillStyle = "rgba(255, 255, 255, .52)";
    ctx.beginPath();
    ctx.ellipse(x, cloud.y, 34 * cloud.s, 10 * cloud.s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 15 * cloud.s, cloud.y - 5 * cloud.s, 15 * cloud.s, 12 * cloud.s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 3 * cloud.s, cloud.y - 10 * cloud.s, 18 * cloud.s, 17 * cloud.s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 20 * cloud.s, cloud.y - 3 * cloud.s, 14 * cloud.s, 12 * cloud.s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHill(x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - width, GROUND + 1);
    ctx.quadraticCurveTo(x - width * .55, y - height * .1, x, y);
    ctx.quadraticCurveTo(x + width * .6, y - height * .15, x + width, GROUND + 1);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround() {
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = colors.ink;
    ctx.fillRect(0, GROUND, W, 3);
    ctx.fillStyle = "rgba(32, 43, 53, .17)";
    const offset = state === "running" ? (distance * 17) % 92 : 0;
    for (let x = -offset; x < W; x += 92) {
      ctx.fillRect(x, GROUND + 25, 36, 2);
      ctx.fillRect(x + 51, GROUND + 47, 17, 2);
    }
    ctx.fillStyle = "rgba(32, 43, 53, .1)";
    ctx.fillRect(0, GROUND + 4, W, 1);
  }

  function drawObstacle(obstacle) {
    const x = obstacle.x;
    const y = obstacle.type === "overhead" ? GROUND - 94 : GROUND - obstacle.h;
    ctx.save();
    if (obstacle.type === "cone") {
      ctx.fillStyle = "rgba(32, 43, 53, .12)";
      ctx.beginPath(); ctx.ellipse(x + obstacle.w / 2, GROUND + 2, 25, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = obstacle.color;
      ctx.beginPath(); ctx.moveTo(x + 2, GROUND); ctx.lineTo(x + obstacle.w / 2, y); ctx.lineTo(x + obstacle.w - 2, GROUND); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff1d8";
      ctx.beginPath(); ctx.moveTo(x + 12, GROUND - 15); ctx.lineTo(x + 25, GROUND - 15); ctx.lineTo(x + 27, GROUND - 21); ctx.lineTo(x + 10, GROUND - 21); ctx.closePath(); ctx.fill();
    } else if (obstacle.type === "block") {
      ctx.fillStyle = "rgba(32, 43, 53, .12)";
      ctx.beginPath(); ctx.ellipse(x + obstacle.w / 2, GROUND + 2, 31, 5, 0, 0, Math.PI * 2); ctx.fill();
      roundedRect(x, y, obstacle.w, obstacle.h, 6, obstacle.color);
      roundedRect(x + 8, y + 8, obstacle.w - 16, 3, 1.5, "rgba(255,255,255,.28)");
      ctx.fillStyle = "rgba(255,255,255,.15)";
      ctx.fillRect(x + 8, y + 18, 4, 4);
    } else {
      roundedRect(x, y, obstacle.w, 15, 5, obstacle.color);
      roundedRect(x + 9, y + 15, 9, 20, 3, obstacle.color);
      roundedRect(x + obstacle.w - 18, y + 15, 9, 20, 3, obstacle.color);
      ctx.fillStyle = colors.lime;
      ctx.fillRect(x + 23, y + 6, 9, 3);
      ctx.fillRect(x + 43, y + 6, 9, 3);
    }
    ctx.restore();
  }

  function roundedRect(x, y, width, height, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
  }

  function drawRunner() {
    const airborne = !runner.grounded;
    const cycle = state === "running" && runner.grounded ? Math.sin(frame) : 0;
    const ducking = runner.ducking;
    const x = runner.x;
    const groundY = runner.y;
    const bodyScaleX = ducking ? 1.16 : 1;
    const bodyScaleY = ducking ? .62 : 1;

    ctx.save();
    ctx.fillStyle = "rgba(32, 43, 53, .19)";
    ctx.beginPath();
    ctx.ellipse(x + 42, GROUND + 4, airborne ? 25 : ducking ? 43 : 31, airborne ? 5 : 7, 0, 0, Math.PI * 2);
    ctx.fill();

    if (ducking) {
      ctx.translate(x + 39, groundY - 2);
      ctx.scale(bodyScaleX, bodyScaleY);
      ctx.translate(-(x + 39), -(groundY - 2));
    }

    const hipX = x + 36;
    const hipY = groundY - 24;
    const stride = airborne ? -.7 : cycle;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawLimb(hipX, hipY, hipX + 7 + stride * 12, groundY - 11 - Math.max(0, stride) * 9, hipX + 18 + stride * 18, groundY - 8 + Math.max(0, stride) * 5, colors.ink, 10);
    drawLimb(hipX - 1, hipY, hipX - 7 - stride * 11, groundY - 16 - Math.max(0, -stride) * 7, hipX - 17 - stride * 17, groundY - 5 + Math.max(0, -stride) * 7, colors.ink, 10);

    ctx.strokeStyle = colors.lime;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x + 37, groundY - 61);
    ctx.quadraticCurveTo(x + 22 + (ducking ? 10 : 0), groundY - 39, hipX, hipY);
    ctx.stroke();
    ctx.strokeStyle = "#8cb83e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 38, groundY - 56);
    ctx.lineTo(x + 31, groundY - 42);
    ctx.stroke();

    const armSwing = ducking ? .25 : stride;
    drawLimb(x + 33, groundY - 56, x + 17 + armSwing * 7, groundY - 43, x + 13 + armSwing * 13, groundY - 33 + armSwing * 5, colors.ink, 7);
    drawLimb(x + 40, groundY - 55, x + 53 - armSwing * 8, groundY - 48, x + 58 - armSwing * 10, groundY - 38, colors.ink, 7);

    const headX = ducking ? x + 54 : x + 39;
    const headY = ducking ? groundY - 61 : groundY - 83 + (state === "running" && !airborne ? Math.abs(cycle) * 2 : 0);
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(ducking ? .32 : airborne ? -.08 : Math.sin(frame * 2) * .025);
    if (headImage.complete && headImage.naturalWidth > 0) {
      ctx.drawImage(headImage, -27, -27, 54, 54);
    } else {
      ctx.fillStyle = "#f2b18a";
      ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = colors.ink;
      ctx.beginPath(); ctx.arc(0, -7, 25, Math.PI, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  function drawLimb(x1, y1, x2, y2, x3, y3, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x3, y3, width * .54, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  headImage.addEventListener("load", () => {
    draw();
    if (!loadingFinished) finishLoading();
  });
  headImage.addEventListener("error", () => {
    if (headImage.src.endsWith(defaultHeadSrc)) {
      console.error("The default runner head image could not be loaded.");
      finishLoading();
      return;
    }
    headImage.src = defaultHeadSrc;
    titleHeadPreview.src = defaultHeadSrc;
    headPreview.src = defaultHeadSrc;
    savedHead = null;
    localStorage.removeItem("headlong-custom-head");
    uploadStatus.textContent = "Saved image could not be loaded. Restored the original head.";
  });
  loadingTimer = window.setInterval(() => {
    if (loadingProgress < 90) setLoadingProgress(loadingProgress + 3);
  }, 80);

  titlePlay.addEventListener("click", launchGame);
  titleSettings.addEventListener("click", () => showScreen(settingsScreen));
  settingsBack.addEventListener("click", () => showScreen(titleScreen));
  gameMenu.addEventListener("click", returnToTitle);
  headUpload.addEventListener("change", () => loadCustomHead(headUpload.files[0]));
  resetHead.addEventListener("click", () => {
    headImage.src = defaultHeadSrc;
    titleHeadPreview.src = defaultHeadSrc;
    headPreview.src = defaultHeadSrc;
    savedHead = null;
    localStorage.removeItem("headlong-custom-head");
    uploadStatus.textContent = "Using the original Headlong head.";
  });
  cropZoom.addEventListener("input", updateCropPreview);
  cropCancel.addEventListener("click", () => closeCrop(true));
  cropApply.addEventListener("click", applyCrop);
  cropDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeCrop(true);
  });
  cropDialog.addEventListener("click", (event) => {
    if (event.target === cropDialog) closeCrop(true);
  });
  cropCanvas.addEventListener("pointerdown", (event) => {
    if (!pendingCropImage) return;
    cropDragging = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    cropCanvas.setPointerCapture(event.pointerId);
  });
  cropCanvas.addEventListener("pointermove", (event) => {
    if (!cropDragging || !pendingCropImage) return;
    const bounds = cropCanvas.getBoundingClientRect();
    const sourcePerPixel = getCropSide() / bounds.width;
    cropCenterX -= (event.clientX - lastPointerX) * sourcePerPixel;
    cropCenterY -= (event.clientY - lastPointerY) * sourcePerPixel;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    updateCropPreview();
  });
  cropCanvas.addEventListener("pointerup", () => { cropDragging = false; });
  cropCanvas.addEventListener("pointercancel", () => { cropDragging = false; });
  playButton.addEventListener("click", start);
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 0 && state === "running") jump();
  });
  window.addEventListener("keydown", (event) => {
    if (loadingScreen.classList.contains("is-hidden") === false ||
        titleScreen.classList.contains("is-hidden") === false ||
        settingsScreen.classList.contains("is-hidden") === false) return;
    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
      event.preventDefault();
      if (!event.repeat && state === "running") jump();
    }
    if (event.code === "ArrowDown" || event.code === "KeyS") {
      event.preventDefault();
      setDuck(true);
    }
    if (event.code === "Escape" && state === "running") {
      state = "paused";
      overlayKicker.textContent = "TAKE YOUR TIME";
      overlayTitle.innerHTML = "Catch your<br>breath.";
      overlayCopy.textContent = "Your run is paused. Ready when you are.";
      buttonLabel.textContent = "Keep running";
      overlay.classList.remove("is-hidden");
    } else if (event.code === "Escape" && state === "paused") {
      start();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowDown" || event.code === "KeyS") setDuck(false);
  });
  window.addEventListener("blur", () => {
    setDuck(false);
    if (state === "running") {
      state = "paused";
      overlayKicker.textContent = "TAKE YOUR TIME";
      overlayTitle.innerHTML = "Catch your<br>breath.";
      overlayCopy.textContent = "Your run is paused. Ready when you are.";
      buttonLabel.textContent = "Keep running";
      overlay.classList.remove("is-hidden");
    }
  });
  window.addEventListener("resize", resize);

  resize();
  draw();
})();
