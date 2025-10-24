const WORLD_HEIGHT = 720;
const FLOOR_Y = WORLD_HEIGHT - 120;
const CEILING_Y = 120;
const PLAYER_SIZE = 64;
const MAX_DELTA_TIME = 1 / 30;

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ']);

function svgDataUri(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const ASSET_DEFINITIONS = [
  {
    key: 'layer-stars',
    src: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
        <rect width="320" height="320" fill="#0b0d21"/>
        <g fill="#ffffff" opacity="0.55">
          <circle cx="20" cy="42" r="2"/>
          <circle cx="280" cy="120" r="1.5"/>
          <circle cx="160" cy="200" r="2.5"/>
          <circle cx="60" cy="260" r="1.8"/>
          <circle cx="300" cy="280" r="1.3"/>
          <circle cx="110" cy="110" r="1.2"/>
        </g>
      </svg>
    `),
  },
  {
    key: 'layer-hills',
    src: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">
        <rect width="320" height="240" fill="#101d3a"/>
        <path d="M0 200 Q80 120 160 200 T320 200 V240 H0 Z" fill="#14274e"/>
        <path d="M0 220 Q70 150 160 220 T320 220 V240 H0 Z" fill="#0f1b3c"/>
      </svg>
    `),
  },
  {
    key: 'layer-foreground',
    src: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
        <rect width="320" height="200" fill="transparent"/>
        <path d="M0 160 Q60 120 120 160 T240 160 T320 160 V200 H0 Z" fill="#1d2d50"/>
        <path d="M0 190 Q50 150 110 190 T220 190 T320 190 V200 H0 Z" fill="#111c34"/>
      </svg>
    `),
  },
  {
    key: 'player-body',
    src: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
        <rect x="10" y="10" width="108" height="108" rx="18" fill="#ffc947" stroke="#ff8c00" stroke-width="10"/>
        <circle cx="48" cy="48" r="14" fill="#1b1f3b"/>
        <rect x="68" y="38" width="30" height="20" rx="6" fill="#1b1f3b"/>
        <rect x="38" y="70" width="52" height="26" rx="8" fill="#1b1f3b"/>
      </svg>
    `),
  },
];

class AssetManager {
  constructor(definitions) {
    this.definitions = definitions;
    this.assets = new Map();
  }

  async loadAll() {
    const promises = this.definitions.map((definition) => this.#loadImage(definition));
    await Promise.all(promises);
  }

  async #loadImage({ key, src }) {
    const image = new Image();
    image.decoding = 'async';
    const promise = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = (event) => reject(new Error(`Failed to load asset ${key}: ${event?.message ?? 'unknown error'}`));
    });
    image.src = src;
    const loaded = await promise;
    this.assets.set(key, loaded);
  }

  get(key) {
    return this.assets.get(key);
  }
}

class InputManager {
  constructor(target) {
    this.jumpQueue = 0;
    this.jumpPressedThisFrame = false;
    this.jumpHeld = false;
    this.pointerHeld = false;
    this.restartRequested = false;

    target.addEventListener('pointerdown', (event) => {
      target.setPointerCapture(event.pointerId);
      this.#handleJumpPress();
      this.pointerHeld = true;
    });

    target.addEventListener('pointerup', (event) => {
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
      this.pointerHeld = false;
      this.jumpHeld = false;
    });

    target.addEventListener('pointercancel', () => {
      this.pointerHeld = false;
      this.jumpHeld = false;
    });

    window.addEventListener('keydown', (event) => {
      if (JUMP_KEYS.has(event.code)) {
        if (!this.jumpHeld) {
          this.#handleJumpPress();
        }
        this.jumpHeld = true;
        event.preventDefault();
      } else if (event.code === 'KeyR') {
        this.restartRequested = true;
      }
    });

    window.addEventListener('keyup', (event) => {
      if (JUMP_KEYS.has(event.code)) {
        this.jumpHeld = false;
        event.preventDefault();
      }
    });
  }

  #handleJumpPress() {
    this.jumpQueue += 1;
    this.jumpPressedThisFrame = true;
  }

  consumeJumpRequest() {
    if (this.jumpQueue > 0) {
      this.jumpQueue = 0;
      return true;
    }
    return false;
  }

  isJumpHeld() {
    return this.jumpHeld || this.pointerHeld;
  }

  didPressJumpThisFrame() {
    return this.jumpPressedThisFrame;
  }

  consumeRestartRequest() {
    const restart = this.restartRequested;
    this.restartRequested = false;
    return restart;
  }

  finalizeFrame() {
    this.jumpPressedThisFrame = false;
  }
}

class Rectangle {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  get left() {
    return this.x;
  }

  get right() {
    return this.x + this.width;
  }

  get top() {
    return this.y;
  }

  get bottom() {
    return this.y + this.height;
  }

  get centerX() {
    return this.x + this.width / 2;
  }

  get centerY() {
    return this.y + this.height / 2;
  }

  intersects(other) {
    return !(
      this.right <= other.left ||
      this.left >= other.right ||
      this.bottom <= other.top ||
      this.top >= other.bottom
    );
  }
}

class Circle {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
  }

  intersectsRect(rect) {
    const closestX = Math.max(rect.left, Math.min(this.x, rect.right));
    const closestY = Math.max(rect.top, Math.min(this.y, rect.bottom));
    const dx = this.x - closestX;
    const dy = this.y - closestY;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }
}

class Player {
  constructor(assets) {
    this.anchorX = 260;
    this.size = PLAYER_SIZE;
    this.position = { x: this.anchorX, y: FLOOR_Y - this.size / 2 };
    this.previousPosition = { x: this.position.x, y: this.position.y };
    this.velocity = { x: 0, y: 0 };
    this.gravityDirection = 1;
    this.gravity = 2200;
    this.maxFallSpeed = 1800;
    this.maxRiseSpeed = 1200;
    this.jumpStrength = 900;
    this.coyoteTime = 0.08;
    this.jumpBufferTime = 0.12;
    this.coyoteTimer = 0;
    this.jumpBuffer = 0;
    this.isGrounded = false;
    this.isAlive = true;
    this.boostTimer = 0;
    this.speedMultiplier = 1;
    this.gravityScaleDuringBoost = 0.65;
    this.assets = assets;
    this.respawnY = this.position.y;
  }

  reset() {
    this.position = { x: this.anchorX, y: FLOOR_Y - this.size / 2 };
    this.previousPosition = { x: this.position.x, y: this.position.y };
    this.velocity = { x: 0, y: 0 };
    this.gravityDirection = 1;
    this.isGrounded = false;
    this.isAlive = true;
    this.coyoteTimer = 0;
    this.jumpBuffer = 0;
    this.boostTimer = 0;
    this.speedMultiplier = 1;
  }

  get halfSize() {
    return this.size / 2;
  }

  getBounds() {
    return new Rectangle(
      this.position.x - this.halfSize,
      this.position.y - this.halfSize,
      this.size,
      this.size
    );
  }

  getPreviousBounds() {
    return new Rectangle(
      this.previousPosition.x - this.halfSize,
      this.previousPosition.y - this.halfSize,
      this.size,
      this.size
    );
  }

  update(dt, input) {
    if (!this.isAlive) {
      return;
    }

    if (input.consumeJumpRequest()) {
      this.jumpBuffer = this.jumpBufferTime;
    }

    this.previousPosition = { x: this.position.x, y: this.position.y };

    const gravityScale = this.boostTimer > 0 ? this.gravityScaleDuringBoost : 1;
    const gravityForce = this.gravity * this.gravityDirection * gravityScale;
    this.velocity.y += gravityForce * dt;
    this.velocity.y = Math.min(this.maxFallSpeed, Math.max(-this.maxRiseSpeed, this.velocity.y));

    this.position.y += this.velocity.y * dt;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

    if (this.boostTimer > 0) {
      this.boostTimer = Math.max(0, this.boostTimer - dt);
      if (this.boostTimer === 0) {
        this.speedMultiplier = 1;
      }
    }
  }

  postResolve() {
    if (!this.isAlive) {
      return;
    }
    if (this.jumpBuffer > 0 && (this.isGrounded || this.coyoteTimer > 0)) {
      this.performJump(this.jumpStrength);
      this.jumpBuffer = 0;
    }
  }

  performJump(strength) {
    this.velocity.y = -strength * this.gravityDirection;
    this.isGrounded = false;
    this.coyoteTimer = 0;
  }

  performOrbJump(power) {
    this.velocity.y = -power * this.gravityDirection;
    this.isGrounded = false;
    this.coyoteTimer = 0;
  }

  land(surfaceY) {
    if (this.gravityDirection === 1) {
      this.position.y = surfaceY - this.halfSize;
    } else {
      this.position.y = surfaceY + this.halfSize;
    }
    this.velocity.y = 0;
    this.isGrounded = true;
    this.coyoteTimer = this.coyoteTime;
  }

  die() {
    this.isAlive = false;
  }

  applyBoost({ multiplier, duration, gravityScale }) {
    this.speedMultiplier = Math.max(multiplier ?? 1, this.speedMultiplier);
    this.boostTimer = Math.max(duration ?? 0, this.boostTimer);
    if (gravityScale) {
      this.gravityScaleDuringBoost = gravityScale;
    }
  }

  flipGravity(targetDirection) {
    const newDirection = targetDirection ?? -this.gravityDirection;
    if (newDirection === this.gravityDirection) {
      return;
    }
    this.gravityDirection = newDirection;
    this.velocity.y = 0;
    if (newDirection === 1) {
      this.position.y = Math.min(this.position.y, FLOOR_Y - this.halfSize);
    } else {
      this.position.y = Math.max(this.position.y, CEILING_Y + this.halfSize);
    }
    this.isGrounded = false;
    this.coyoteTimer = 0;
  }

  draw(ctx, assets, scale, scrollX) {
    const sprite = assets.get('player-body');
    const bounds = this.getBounds();
    const screenX = (bounds.left - scrollX) * scale;
    const screenY = bounds.top * scale;
    const size = this.size * scale;

    ctx.save();
    ctx.translate(screenX + size / 2, screenY + size / 2);
    ctx.rotate(this.gravityDirection === 1 ? 0 : Math.PI);
    ctx.translate(-size / 2, -size / 2);
    if (sprite) {
      ctx.drawImage(sprite, 0, 0, size, size);
    } else {
      ctx.fillStyle = '#ffc947';
      ctx.fillRect(0, 0, size, size);
    }
    ctx.restore();
  }
}

class SegmentEntity {
  constructor(template) {
    this.type = template.type;
    this.x = template.x;
    this.y = template.y;
    this.width = template.width ?? 0;
    this.height = template.height ?? 0;
    this.radius = template.radius ?? 0;
    this.orientation = template.orientation ?? 'up';
    this.properties = template.properties ? { ...template.properties } : {};
    this.cooldown = 0;
  }

  reset() {
    this.cooldown = 0;
  }

  updateCooldown(dt) {
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
    }
  }
}

class LevelSegment {
  constructor(template) {
    this.template = template;
    this.entities = template.entities.map((entity) => new SegmentEntity(entity));
    this.offset = 0;
  }

  reset(offset) {
    this.offset = offset;
    this.entities.forEach((entity) => entity.reset());
  }

  get end() {
    return this.offset + this.template.width;
  }
}

const SEGMENT_LIBRARY = [
  {
    width: 1400,
    entities: [
      { type: 'platform', x: 280, y: FLOOR_Y - 160, width: 200, height: 32 },
      { type: 'platform', x: 620, y: FLOOR_Y - 220, width: 220, height: 32 },
      { type: 'platform', x: 940, y: FLOOR_Y - 320, width: 180, height: 32 },
      { type: 'spike', x: 540, y: FLOOR_Y - 64, width: 64, height: 64, orientation: 'up' },
      { type: 'spike', x: 860, y: FLOOR_Y - 64, width: 64, height: 64, orientation: 'up' },
      {
        type: 'booster',
        x: 320,
        y: FLOOR_Y - 120,
        width: 80,
        height: 80,
        properties: { multiplier: 1.35, duration: 1.2, gravityScale: 0.55 },
      },
      { type: 'orb', x: 720, y: FLOOR_Y - 240, radius: 28, properties: { power: 1050, cooldown: 0.35 } },
      { type: 'portal', x: 1120, y: FLOOR_Y - 200, width: 64, height: 200, properties: { gravity: -1, cooldown: 1 } },
    ],
  },
  {
    width: 1200,
    entities: [
      { type: 'platform', x: 120, y: CEILING_Y + 120, width: 240, height: 32 },
      { type: 'platform', x: 480, y: CEILING_Y + 180, width: 200, height: 32 },
      { type: 'platform', x: 820, y: CEILING_Y + 130, width: 280, height: 32 },
      { type: 'spike', x: 360, y: CEILING_Y, width: 60, height: 60, orientation: 'down' },
      { type: 'spike', x: 700, y: CEILING_Y, width: 60, height: 60, orientation: 'down' },
      { type: 'orb', x: 520, y: CEILING_Y + 220, radius: 26, properties: { power: 980, cooldown: 0.4 } },
      { type: 'booster', x: 900, y: CEILING_Y + 150, width: 76, height: 76, properties: { multiplier: 1.2, duration: 1.1, gravityScale: 0.75 } },
      { type: 'portal', x: 1000, y: CEILING_Y, width: 60, height: 180, properties: { gravity: 1, cooldown: 1 } },
    ],
  },
  {
    width: 1360,
    entities: [
      { type: 'platform', x: 180, y: FLOOR_Y - 140, width: 200, height: 32 },
      { type: 'platform', x: 520, y: FLOOR_Y - 220, width: 240, height: 32 },
      { type: 'platform', x: 880, y: FLOOR_Y - 160, width: 200, height: 32 },
      { type: 'platform', x: 1080, y: FLOOR_Y - 260, width: 180, height: 32 },
      { type: 'spike', x: 420, y: FLOOR_Y - 64, width: 64, height: 64, orientation: 'up' },
      { type: 'spike', x: 760, y: FLOOR_Y - 64, width: 64, height: 64, orientation: 'up' },
      { type: 'spike', x: 1020, y: FLOOR_Y - 64, width: 64, height: 64, orientation: 'up' },
      { type: 'orb', x: 640, y: FLOOR_Y - 260, radius: 30, properties: { power: 1100, cooldown: 0.3 } },
      {
        type: 'booster',
        x: 260,
        y: FLOOR_Y - 120,
        width: 80,
        height: 80,
        properties: { multiplier: 1.25, duration: 1.4, gravityScale: 0.6 },
      },
    ],
  },
  {
    width: 1280,
    entities: [
      { type: 'platform', x: 160, y: FLOOR_Y - 200, width: 180, height: 32 },
      { type: 'platform', x: 480, y: FLOOR_Y - 280, width: 200, height: 32 },
      { type: 'platform', x: 800, y: FLOOR_Y - 220, width: 220, height: 32 },
      { type: 'platform', x: 1080, y: FLOOR_Y - 320, width: 160, height: 32 },
      { type: 'orb', x: 380, y: FLOOR_Y - 320, radius: 26, properties: { power: 1120, cooldown: 0.35 } },
      { type: 'orb', x: 960, y: FLOOR_Y - 360, radius: 28, properties: { power: 1180, cooldown: 0.35 } },
      { type: 'spike', x: 560, y: FLOOR_Y - 64, width: 64, height: 64, orientation: 'up' },
      { type: 'spike', x: 900, y: FLOOR_Y - 64, width: 64, height: 64, orientation: 'up' },
      { type: 'booster', x: 680, y: FLOOR_Y - 120, width: 80, height: 80, properties: { multiplier: 1.3, duration: 1.3, gravityScale: 0.6 } },
    ],
  },
];

class ParallaxLayer {
  constructor(image, speedFactor, opacity = 1) {
    this.image = image;
    this.speedFactor = speedFactor;
    this.opacity = opacity;
  }

  draw(ctx, scrollX, scale, viewportWidth, viewportHeight) {
    if (!this.image) {
      return;
    }
    const patternWidth = this.image.width * scale;
    const patternHeight = this.image.height * scale;
    const offset = (scrollX * this.speedFactor * scale) % patternWidth;

    ctx.save();
    ctx.globalAlpha = this.opacity;
    for (let x = -patternWidth; x < viewportWidth + patternWidth; x += patternWidth) {
      for (let y = -patternHeight; y < viewportHeight + patternHeight; y += patternHeight) {
        ctx.drawImage(this.image, x - offset, y, patternWidth, patternHeight);
      }
    }
    ctx.restore();
  }
}

class Level {
  constructor(templates) {
    this.templates = templates;
    this.activeSegments = [];
    this.baseSpeed = 360;
    this.currentSpeed = this.baseSpeed;
    this.scrollX = 0;
    this.viewportWorldWidth = 1280;
    this.recycleMargin = 640;
  }

  setViewport(worldWidth) {
    this.viewportWorldWidth = worldWidth;
    this.recycleMargin = Math.max(400, worldWidth * 0.75);
  }

  reset() {
    this.scrollX = 0;
    this.currentSpeed = this.baseSpeed;
    this.activeSegments = [];
    let offset = 0;
    for (let index = 0; index < 4; index += 1) {
      const template = this.templates[index % this.templates.length];
      const segment = new LevelSegment(template);
      segment.reset(offset);
      this.activeSegments.push(segment);
      offset += template.width;
    }
  }

  pickNextTemplate() {
    const randomIndex = Math.floor(Math.random() * this.templates.length);
    return this.templates[randomIndex];
  }

  update(dt, player) {
    const targetSpeed = this.baseSpeed * player.speedMultiplier;
    const smoothing = 1 - Math.exp(-dt * 6);
    this.currentSpeed += (targetSpeed - this.currentSpeed) * smoothing;
    this.scrollX += this.currentSpeed * dt;

    const recycleThreshold = this.scrollX - this.recycleMargin;
    let lastSegment = this.activeSegments[this.activeSegments.length - 1];
    while (this.activeSegments.length > 0 && this.activeSegments[0].end < recycleThreshold) {
      const recycled = this.activeSegments.shift();
      const template = this.pickNextTemplate();
      recycled.template = template;
      recycled.entities = template.entities.map((entity) => new SegmentEntity(entity));
      recycled.reset(lastSegment.end);
      this.activeSegments.push(recycled);
      lastSegment = recycled;
    }
  }

  resolvePlayer(player, input, dt) {
    let playerRect = player.getBounds();
    const previousRect = player.getPreviousBounds();

    if (player.gravityDirection === 1) {
      if (playerRect.bottom >= FLOOR_Y) {
        player.land(FLOOR_Y);
        playerRect = player.getBounds();
      }
    } else if (playerRect.top <= CEILING_Y) {
      player.land(CEILING_Y);
      playerRect = player.getBounds();
    }

    const visibleStart = this.scrollX - this.recycleMargin;
    const visibleEnd = this.scrollX + this.viewportWorldWidth + this.recycleMargin;

    for (const segment of this.activeSegments) {
      if (segment.end < visibleStart || segment.offset > visibleEnd) {
        continue;
      }
      for (const entity of segment.entities) {
        entity.updateCooldown(dt);
        switch (entity.type) {
          case 'platform':
            this.#resolvePlatform(player, entity, segment.offset, playerRect, previousRect);
            break;
          case 'spike':
            if (this.#checkSpikeCollision(playerRect, segment.offset, entity)) {
              player.die();
              return;
            }
            break;
          case 'booster':
            if (this.#checkEntityOverlap(playerRect, segment.offset, entity) && entity.cooldown === 0) {
              player.applyBoost({
                multiplier: entity.properties.multiplier ?? 1.2,
                duration: entity.properties.duration ?? 1,
                gravityScale: entity.properties.gravityScale ?? 0.7,
              });
              entity.cooldown = (entity.properties.cooldown ?? entity.properties.duration ?? 1) + 0.2;
            }
            break;
          case 'orb':
            if (entity.cooldown === 0 && this.#checkOrbCollision(playerRect, segment.offset, entity)) {
              if (input.didPressJumpThisFrame() || input.isJumpHeld()) {
                player.performOrbJump(entity.properties.power ?? 1000);
                entity.cooldown = entity.properties.cooldown ?? 0.3;
              }
            }
            break;
          case 'portal':
            if (this.#checkEntityOverlap(playerRect, segment.offset, entity) && entity.cooldown === 0) {
              player.flipGravity(entity.properties.gravity);
              entity.cooldown = entity.properties.cooldown ?? 0.8;
              playerRect = player.getBounds();
            }
            break;
          default:
            break;
        }
      }
    }

    if (player.isGrounded && player.gravityDirection === 1 && player.getBounds().bottom > FLOOR_Y) {
      player.land(FLOOR_Y);
    }
    if (player.isGrounded && player.gravityDirection === -1 && player.getBounds().top < CEILING_Y) {
      player.land(CEILING_Y);
    }
  }

  #resolvePlatform(player, entity, offset, currentRect, previousRect) {
    const rect = new Rectangle(
      offset + entity.x,
      entity.y,
      entity.width,
      entity.height
    );

    if (!currentRect.intersects(rect)) {
      return;
    }

    if (player.gravityDirection === 1) {
      const wasAbove = previousRect.bottom <= rect.top + Math.abs(player.velocity.y) * 0.02;
      if (wasAbove && currentRect.bottom >= rect.top) {
        player.land(rect.top);
        const updated = player.getBounds();
        currentRect.x = updated.x;
        currentRect.y = updated.y;
        currentRect.width = updated.width;
        currentRect.height = updated.height;
      }
    } else {
      const wasBelow = previousRect.top >= rect.bottom - Math.abs(player.velocity.y) * 0.02;
      if (wasBelow && currentRect.top <= rect.bottom) {
        player.land(rect.bottom);
        const updated = player.getBounds();
        currentRect.x = updated.x;
        currentRect.y = updated.y;
        currentRect.width = updated.width;
        currentRect.height = updated.height;
      }
    }
  }

  #checkEntityOverlap(playerRect, offset, entity) {
    const rect = new Rectangle(
      offset + entity.x,
      entity.y,
      entity.width,
      entity.height
    );
    return playerRect.intersects(rect);
  }

  #checkOrbCollision(playerRect, offset, entity) {
    const circle = new Circle(offset + entity.x, entity.y, entity.radius);
    return circle.intersectsRect(playerRect);
  }

  #checkSpikeCollision(playerRect, offset, entity) {
    const rect = new Rectangle(
      offset + entity.x,
      entity.y,
      entity.width,
      entity.height
    );
    if (!playerRect.intersects(rect)) {
      return false;
    }

    const relativeX = (playerRect.centerX - rect.left) / rect.width;
    if (entity.orientation === 'up') {
      const spikeY = rect.bottom - Math.abs(relativeX - 0.5) * rect.height * 2;
      return playerRect.bottom >= spikeY;
    }
    const spikeY = rect.top + Math.abs(relativeX - 0.5) * rect.height * 2;
    return playerRect.top <= spikeY;
  }

  draw(ctx, scale, scrollX, viewportWidth, viewportHeight) {
    ctx.save();
    ctx.fillStyle = '#182238';
    const groundHeight = (viewportHeight - FLOOR_Y * scale);
    ctx.fillRect(0, viewportHeight - groundHeight, viewportWidth, groundHeight);
    ctx.restore();

    const visibleStart = this.scrollX - this.recycleMargin;
    const visibleEnd = this.scrollX + this.viewportWorldWidth + this.recycleMargin;

    for (const segment of this.activeSegments) {
      if (segment.end < visibleStart || segment.offset > visibleEnd) {
        continue;
      }
      for (const entity of segment.entities) {
        const screenX = (segment.offset + entity.x - scrollX) * scale;
        switch (entity.type) {
          case 'platform':
            this.#drawPlatform(ctx, screenX, entity, scale);
            break;
          case 'spike':
            this.#drawSpike(ctx, screenX, entity, scale);
            break;
          case 'booster':
            this.#drawBooster(ctx, screenX, entity, scale);
            break;
          case 'orb':
            this.#drawOrb(ctx, screenX, entity, scale);
            break;
          case 'portal':
            this.#drawPortal(ctx, screenX, entity, scale);
            break;
          default:
            break;
        }
      }
    }
  }

  #drawPlatform(ctx, screenX, entity, scale) {
    const width = entity.width * scale;
    const height = entity.height * scale;
    const screenY = entity.y * scale;
    ctx.fillStyle = '#2f3b52';
    ctx.fillRect(screenX, screenY, width, height);
    ctx.fillStyle = '#40516f';
    ctx.fillRect(screenX, screenY, width, height / 4);
  }

  #drawSpike(ctx, screenX, entity, scale) {
    const width = entity.width * scale;
    const height = entity.height * scale;
    const screenY = entity.y * scale;
    ctx.fillStyle = '#d72638';
    ctx.beginPath();
    if (entity.orientation === 'up') {
      ctx.moveTo(screenX, screenY + height);
      ctx.lineTo(screenX + width / 2, screenY);
      ctx.lineTo(screenX + width, screenY + height);
    } else {
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX + width / 2, screenY + height);
      ctx.lineTo(screenX + width, screenY);
    }
    ctx.closePath();
    ctx.fill();
  }

  #drawBooster(ctx, screenX, entity, scale) {
    const width = entity.width * scale;
    const height = entity.height * scale;
    const screenY = entity.y * scale;
    const gradient = ctx.createLinearGradient(screenX, screenY, screenX, screenY + height);
    gradient.addColorStop(0, 'rgba(72, 149, 239, 0.9)');
    gradient.addColorStop(1, 'rgba(40, 84, 188, 0.6)');
    ctx.fillStyle = gradient;
    ctx.fillRect(screenX, screenY, width, height);
    ctx.strokeStyle = 'rgba(109, 196, 255, 0.8)';
    ctx.lineWidth = Math.max(2, 4 * scale);
    ctx.strokeRect(screenX, screenY, width, height);
  }

  #drawOrb(ctx, screenX, entity, scale) {
    const radius = entity.radius * scale;
    const screenY = entity.y * scale;
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(screenX, screenY, radius * 0.2, screenX, screenY, radius);
    gradient.addColorStop(0, 'rgba(255, 221, 87, 1)');
    gradient.addColorStop(1, 'rgba(255, 128, 0, 0.2)');
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  #drawPortal(ctx, screenX, entity, scale) {
    const width = entity.width * scale;
    const height = entity.height * scale;
    const screenY = entity.y * scale;
    const gradient = ctx.createLinearGradient(screenX, screenY, screenX + width, screenY + height);
    gradient.addColorStop(0, entity.properties.gravity === -1 ? '#9d4edd' : '#2d6a4f');
    gradient.addColorStop(1, '#0b132b');
    ctx.fillStyle = gradient;
    ctx.fillRect(screenX, screenY, width, height);
  }
}

class Hud {
  constructor() {
    this.distance = 0;
    this.attempt = 1;
    this.bestDistance = 0;
    this.runTime = 0;
    this.bestTime = 0;
  }

  reset(attempt) {
    this.attempt = attempt;
    this.distance = 0;
    this.runTime = 0;
  }

  update(distance, dt) {
    this.distance = distance;
    this.runTime += dt;
    if (distance > this.bestDistance) {
      this.bestDistance = distance;
      this.bestTime = this.runTime;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillStyle = '#f8f9fa';
    ctx.textBaseline = 'top';
    const lines = [
      `Attempt: ${this.attempt}`,
      `Distance: ${Math.floor(this.distance).toLocaleString()}m`,
      `Time: ${this.runTime.toFixed(1)}s`,
      `Best: ${Math.floor(this.bestDistance).toLocaleString()}m in ${this.bestTime.toFixed(1)}s`,
      'Controls: Space / Click to jump, hold for orbs, R to restart',
    ];
    lines.forEach((line, index) => {
      ctx.fillText(line, 20, 20 + index * 20);
    });
    ctx.restore();
  }
}

class Game {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;
    this.input = new InputManager(canvas);
    this.player = new Player(assets);
    this.level = new Level(SEGMENT_LIBRARY);
    this.hud = new Hud();
    this.parallaxLayers = [
      new ParallaxLayer(assets.get('layer-stars'), 0.08, 0.7),
      new ParallaxLayer(assets.get('layer-hills'), 0.18, 0.9),
      new ParallaxLayer(assets.get('layer-foreground'), 0.3, 0.9),
    ];
    this.viewportWidth = window.innerWidth;
    this.viewportHeight = window.innerHeight;
    this.scale = 1;
    this.lastTimestamp = 0;
    this.animationFrame = 0;
    this.isRunning = false;
    this.attempt = 1;

    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();
    this.reset();
  }

  resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    this.viewportWidth = window.innerWidth;
    this.viewportHeight = window.innerHeight;
    if (this.canvas.width !== this.viewportWidth * ratio || this.canvas.height !== this.viewportHeight * ratio) {
      this.canvas.width = this.viewportWidth * ratio;
      this.canvas.height = this.viewportHeight * ratio;
      this.canvas.style.width = `${this.viewportWidth}px`;
      this.canvas.style.height = `${this.viewportHeight}px`;
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(ratio, ratio);
    this.scale = this.viewportHeight / WORLD_HEIGHT;
    this.level.setViewport(this.viewportWidth / this.scale);
  }

  reset() {
    this.level.reset();
    this.player.reset();
    this.player.position.x = this.player.anchorX;
    this.player.position.y = FLOOR_Y - this.player.halfSize;
    this.hud.reset(this.attempt);
    this.lastTimestamp = performance.now();
    this.isRunning = true;
  }

  start() {
    if (!this.isRunning) {
      this.reset();
    }
    const loop = (timestamp) => {
      this.animationFrame = requestAnimationFrame(loop);
      this.update(timestamp);
      this.render();
    };
    this.animationFrame = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    this.isRunning = false;
  }

  update(timestamp) {
    const deltaTime = Math.min(MAX_DELTA_TIME, (timestamp - this.lastTimestamp) / 1000 || 0);
    this.lastTimestamp = timestamp;

    if (!this.isRunning) {
      return;
    }

    if (this.input.consumeRestartRequest()) {
      this.attempt += 1;
      this.reset();
      return;
    }

    this.player.update(deltaTime, this.input);
    this.player.position.x = this.level.scrollX + this.player.anchorX;
    this.level.update(deltaTime, this.player);
    this.level.resolvePlayer(this.player, this.input, deltaTime);
    this.player.postResolve();

    const distance = this.level.scrollX / 10;
    this.hud.update(distance, deltaTime);

    if (!this.player.isAlive) {
      this.attempt += 1;
      this.isRunning = false;
      setTimeout(() => this.reset(), 600);
    }

    this.input.finalizeFrame();
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);

    ctx.fillStyle = '#050c1a';
    ctx.fillRect(0, 0, this.viewportWidth, this.viewportHeight);

    for (const layer of this.parallaxLayers) {
      layer.draw(ctx, this.level.scrollX, this.scale, this.viewportWidth, this.viewportHeight);
    }

    this.level.draw(ctx, this.scale, this.level.scrollX, this.viewportWidth, this.viewportHeight);
    this.player.draw(ctx, this.assets, this.scale, this.level.scrollX);
    this.hud.draw(ctx);

    ctx.restore();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('gameCanvas');
  const assets = new AssetManager(ASSET_DEFINITIONS);
  await assets.loadAll();
  const game = new Game(canvas, assets);
  game.start();
});

