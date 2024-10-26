/*============================================================================*\
+*
+* This project is an open source template to make some blocks act like chairs, 
+* this accomplishes that by spawning in an entity and seating the player on it, 
+* and removing the entity when it's not used.
+*
+* Copyright (c) 2024 xAssassin <https://Assassin1065.github.io>
+* This project is licensed under the MIT License.
+* See LICENSE for more details.
+* See Credits.txt for a list of contributors. Thank you to all of them for 
+* making this project possible.
+*
\*============================================================================*/

import { world, system, Direction } from "@minecraft/server";

//set up consts
const COOLDOWN_DURATION = 5;
//seat radius is a check that more reliably checks if a player is currently riding a seat entity.
const SEAT_RADIUS = 0.25;
//breathable blocks are used for a check to check above a chair block if you can sit or not.
const BREATHABLE_BLOCKS = new Set([
    "minecraft:air", "minecraft:frame", "minecraft:glow_frame", "minecraft:painting", "minecraft:banner",
    "minecraft:water", "minecraft:lava"
]);
const BREATHABLE_PREFIXES = ["sign", "gate", "door", "button", "torch", "lever", "rod", "chain", "cobweb", "hanging", "berry", "carpet"];
//invalid item names just means any items with these names will not allow you to sit on the chair block when you right click it.
const INVALID_ITEM_NAMES = ["debug", "bucket", "spawn_egg", "steel", "chair"];

//dimension stuff, required for spawning the entity in the correct dimension
const OVERWORLD = world.getDimension("minecraft:overworld");
const NETHER = world.getDimension("minecraft:nether");
const END = world.getDimension("minecraft:the_end");

const DIMENSIONS = [OVERWORLD, NETHER, END];

const cooldowns = new Set();
const activeSeats = new Map();

const isBreathableBlock = (typeId) => (
    BREATHABLE_BLOCKS.has(typeId) || BREATHABLE_PREFIXES.some(prefix => typeId.includes(prefix))
);

const initializeScript = () => {
  console.warn("§g§lChairs§r§a loaded§r");

  system.runTimeout(() => {
    DIMENSIONS.forEach(dimension => {
      const seatEntities = dimension.getEntities().filter(entity => entity.typeId === "xassassin:seat");
      seatEntities.forEach(seatEntity => seatEntity.kill());
    });
  }, 1);
};

const playerWithinRadius = (player, seatEntity, radius) => {
  const distance = Math.sqrt(
    Math.pow(player.location.x - seatEntity.location.x, 2) +
    Math.pow(player.location.y - seatEntity.location.y, 2) +
    Math.pow(player.location.z - seatEntity.location.z, 2)
  );
  return distance <= radius;
};

const handleItemUseOn = (eventData) => {
  const player = eventData.player;
  const blockLocation = eventData.block.location;
  const dimension = world.getDimension(player.dimension.id);
  const item = eventData.itemStack;

  if (item && INVALID_ITEM_NAMES.some(name => item.typeId.toLowerCase().includes(name))) return;

  const currentBlock = dimension.getBlock(blockLocation);
  if (!currentBlock.typeId.includes("chair")) return;

  if (!player.isSneaking) {
    eventData.cancel = true; 
  } else {
    return;
  }

  const blockAbove1 = dimension.getBlock({ x: blockLocation.x, y: blockLocation.y + 1, z: blockLocation.z });
  if (!isBreathableBlock(blockAbove1.typeId)) return;
  if (eventData.blockFace === Direction.Down) return;

  const playerY = Math.floor(player.location.y);
  if (!player.isOnGround || Math.abs(blockLocation.y - playerY) >= 3) return;

  const existingSeatEntity = dimension.getEntities().find(entity => 
    entity.typeId === "xassassin:seat" && 
    Math.floor(entity.location.x) === Math.floor(blockLocation.x) &&
    Math.floor(entity.location.y) === Math.floor(blockLocation.y) &&
    Math.floor(entity.location.z) === Math.floor(blockLocation.z)
  );

  if (existingSeatEntity) {
    const nearbyPlayers = world.getPlayers().filter(p => playerWithinRadius(p, existingSeatEntity, SEAT_RADIUS));
    if (nearbyPlayers.length === 0) {
      system.runTimeout(() => existingSeatEntity.remove(), COOLDOWN_DURATION);
    }
    return;
  }

  if (cooldowns.has(player.id)) return;

  cooldowns.add(player.id);
  system.runTimeout(() => cooldowns.delete(player.id), COOLDOWN_DURATION);

  system.runTimeout(() => {
    const cardinalDirection = currentBlock.permutation.getState("minecraft:cardinal_direction");
    const seatRotation = { north: 0, west: 270, south: 180, east: 90 }[cardinalDirection] || 0;

    const seat = dimension.spawnEntity("xassassin:seat", {
      x: blockLocation.x + 0.5,
      y: blockLocation.y,
      z: blockLocation.z + 0.5,
    });

    seat.setRotation({ x: 0, y: seatRotation });
    seat.getComponent("rideable").addRider(player);
    activeSeats.set(seat.id, blockLocation);

    const checkInterval = system.runInterval(() => {
      const seatEntity = world.getEntity(seat.id);
      if (!seatEntity) {
        system.clearRun(checkInterval);
        return;
      }

      const currentBlock = dimension.getBlock(activeSeats.get(seat.id));
      const isBlockRemoved = BREATHABLE_BLOCKS.has(currentBlock.typeId);

      const nearbyPlayers = world.getPlayers().filter(p => playerWithinRadius(p, seatEntity, 0.5));
      if (isBlockRemoved || nearbyPlayers.length === 0) {
        system.runTimeout(() => seatEntity.remove(), COOLDOWN_DURATION);
        activeSeats.delete(seat.id);
        system.clearRun(checkInterval);
      }
    }, 10);
  }, 5);
};

const handleEntityHurt = (eventData) => {
  const player = eventData.hurtEntity;
  if (player.typeId !== "minecraft:player") return;

  const dimension = player.dimension;
  const seatEntities = dimension.getEntities().filter(e => e.typeId === "xassassin:seat");

  seatEntities.forEach(seatEntity => {
    if (playerWithinRadius(player, seatEntity, 0.5)) {
      system.runTimeout(() => seatEntity.remove(), COOLDOWN_DURATION);
    }
  });
};

//actual execution of code below:
initializeScript();
world.beforeEvents.playerInteractWithBlock.subscribe(handleItemUseOn);
world.afterEvents.entityHurt.subscribe(handleEntityHurt);
