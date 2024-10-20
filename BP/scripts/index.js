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

// Constants for cooldown duration and seat radius
const COOLDOWN_DURATION = 5;
const SEAT_RADIUS = 0.25;

// Set of blocks that the player can breathe through
const BREATHABLE_BLOCKS = new Set([
    "minecraft:air", "minecraft:frame", "minecraft:glow_frame", "minecraft:painting", "minecraft:banner",
    "minecraft:water", "minecraft:lava"
]);

// Prefixes of blocks that are considered breathable (like doors, signs, etc.)
const BREATHABLE_PREFIXES = ["sign", "gate", "door", "button", "torch", "lever", "rod", "chain"];

// List of invalid item names, including the "chair" to avoid recursive interaction
const INVALID_ITEM_NAMES = ["debug", "bucket", "spawn_egg", "steel", "chair"];

// List of Minecraft dimension names
const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

// Set to keep track of players with active cooldowns
const cooldowns = new Set();

// Map to store active seat entities with their locations
const activeSeats = new Map();

// Helper function to determine if a block is breathable
const isBreathableBlock = (typeId) => (
    BREATHABLE_BLOCKS.has(typeId) || BREATHABLE_PREFIXES.some(prefix => typeId.includes(prefix))
);

// Initialization function to set up the script
const initializeScript = () => {
  console.warn("§g§lChairs§r§a loaded§r");

  // Run once to clean up leftover seat entities in each dimension
  system.runTimeout(() => {
    DIMENSIONS.forEach(dimensionName => {
      const dimension = world.getDimension(dimensionName);
      const seatEntities = dimension.getEntities().filter(entity => entity.typeId === "xassassin:seat");
      
      // Kill all existing seat entities
      seatEntities.forEach(seatEntity => seatEntity.kill());
    });
  }, 1);
};

// Helper function to check if a player is within a certain radius of a seat entity
const playerWithinRadius = (player, seatEntity, radius) => {
  const distance = Math.sqrt(
    Math.pow(player.location.x - seatEntity.location.x, 2) +
    Math.pow(player.location.y - seatEntity.location.y, 2) +
    Math.pow(player.location.z - seatEntity.location.z, 2)
  );
  return distance <= radius;
};

// Event handler for item use on a block (to detect if a player is trying to sit)
const handleItemUseOn = (eventData) => {
  const player = eventData.source;
  const blockLocation = eventData.block.location;
  const dimension = world.getDimension(player.dimension.id);
  const item = player.getComponent("inventory").container.getItem(player.selectedSlotIndex);

  // Return if the item is invalid
  if (!item || INVALID_ITEM_NAMES.some(name => item.typeId.toLowerCase().includes(name))) return;

  const currentBlock = dimension.getBlock(blockLocation);
  // Only proceed if the block is a chair
  if (!currentBlock.typeId.includes("chair")) return;

  // If the player is not sneaking, cancel the event
  if (!player.isSneaking) {
    eventData.cancel = true; 
  } else {
    return;
  }

  const blockAbove1 = dimension.getBlock({ x: blockLocation.x, y: blockLocation.y + 1, z: blockLocation.z });
  // Check if the block above is breathable
  if (!isBreathableBlock(blockAbove1.typeId)) return;
  
  // Do not allow seating if the block face is down
  if (eventData.blockFace === Direction.Down) return;

  const playerY = Math.floor(player.location.y);
  // Ensure the player is on the ground and within a certain height range
  if (!player.isOnGround || Math.abs(blockLocation.y - playerY) >= 3) return;

  // Check if a seat entity already exists at the block location
  const existingSeatEntity = dimension.getEntities().find(entity => 
    entity.typeId === "xassassin:seat" && 
    Math.floor(entity.location.x) === Math.floor(blockLocation.x) &&
    Math.floor(entity.location.y) === Math.floor(blockLocation.y) &&
    Math.floor(entity.location.z) === Math.floor(blockLocation.z)
  );

  // If a seat entity exists, remove it after the cooldown if no players are nearby
  if (existingSeatEntity) {
    const nearbyPlayers = world.getPlayers().filter(p => playerWithinRadius(p, existingSeatEntity, SEAT_RADIUS));
    if (nearbyPlayers.length === 0) {
      system.runTimeout(() => existingSeatEntity.remove(), COOLDOWN_DURATION);
    }
    return;
  }

  // Prevent repeated actions by adding the player to the cooldown set
  if (cooldowns.has(player.id)) return;
  cooldowns.add(player.id);
  system.runTimeout(() => cooldowns.delete(player.id), COOLDOWN_DURATION);

  // Spawn the seat entity and make the player sit on it
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

    // Interval to check the seat's status and remove it if needed
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

// Event handler for when a player is hurt (removes the seat if the player is near one)
const handleEntityHurt = (eventData) => {
  const player = eventData.hurtEntity;
  if (player.typeId !== "minecraft:player") return;

  const dimension = world.getDimension(player.dimension.id);
  const seatEntities = dimension.getEntities().filter(e => e.typeId === "xassassin:seat");

  seatEntities.forEach(seatEntity => {
    if (playerWithinRadius(player, seatEntity, 0.5)) {
      system.runTimeout(() => seatEntity.remove(), COOLDOWN_DURATION);
    }
  });
};

// Initialize the script and set up event subscriptions
initializeScript();
world.beforeEvents.itemUseOn.subscribe(handleItemUseOn);
world.afterEvents.entityHurt.subscribe(handleEntityHurt);
