/*============================================================================*\
+*
+* This project is an open source template to make some blocks act like chairs, this accomplishes that by spawning in an entity and seating the player on it, and removing the entity when it's not used.
+*
+* Copyright (c) 2024 xAssassin <https://Assassin1065.github.io>
+* This project is licensed under the MIT License.
+* See LICENSE for more details.
+* See Credits.txt for a list of contributors. Thank you to all of them for making this project possible.
+*
\*============================================================================*/

import { world, system, Direction } from "@minecraft/server";

// A set to track player cooldowns for interacting with seats
const cooldowns = new Set();
// A map to track active seat entities and their locations
const activeSeats = new Map();
// The cooldown duration in seconds to prevent repeated interactions
const cooldownDuration = 5;

// List of invalid item names that shouldn't trigger the seating logic
const invalidItemNames = [
    "debug", "bucket", "spawn_egg", "steel"
];

// Initialize the script and remove any existing seat entities on startup
const initializeScript = () => {
  console.warn("§g§lChairs§r§a loaded§r");

  // Remove all existing seat entities in each dimension after 1 tick
  system.runTimeout(() => {
    const dimensions = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
    dimensions.forEach(dimensionName => {
      const dimension = world.getDimension(dimensionName);
      const seatEntities = dimension.getEntities().filter(entity => entity.typeId === "xassassin:seat");

      // Use Entity.kill() instead of running the /kill command to clean up
      seatEntities.forEach(seatEntity => seatEntity.kill());
    });
  }, 1);
};

initializeScript();

// Event listener for when a player uses an item on a block (e.g., right-clicks a block)
world.beforeEvents.itemUseOn.subscribe((eventData) => {
  const player = eventData.source;
  const blockLocation = eventData.block.location;
  const dimension = world.getDimension(player.dimension.id);

  // Get the item in the player's hand
  const item = player.getComponent("inventory").container.getItem(player.selectedSlotIndex);
  if (!item) return;
  const itemName = item.typeId.toLowerCase();

  // Cancel interaction if the item name contains any invalid strings
  if (invalidItemNames.some(name => itemName.includes(name))) return;

  // Get the block at the location where the player is interacting
  const currentBlock = dimension.getBlock(blockLocation);

  // Check if the block is a type of chair, if not, return
  if (!currentBlock.typeId.includes("chair")) {
    return;
  }

  // Cancel interaction if the player isn't sneaking (prevents block placement)
  if (!player.isSneaking) {
    eventData.cancel = true;  // Cancel block placement
  }

  // Check if the block above the current block is breathable (e.g., air, signs, etc.)
  const blockAbove1 = dimension.getBlock({ x: blockLocation.x, y: blockLocation.y + 1, z: blockLocation.z });
  const isBreathableBlock = (typeId) => (
      typeId === "minecraft:air" ||
      typeId.includes("sign") ||
      typeId === "minecraft:frame" ||
      typeId === "minecraft:glow_frame" ||
      typeId === "minecraft:painting" ||
      typeId === "minecraft:banner" ||
      typeId.includes("gate") ||
      typeId.includes("door") ||
      typeId.includes("button") ||
      typeId.includes("torch") ||
      typeId.includes("lever") ||
      typeId.includes("rod") ||
      typeId.includes("chain")
    );

  if (!isBreathableBlock(blockAbove1.typeId)) return;

  // Check if the interaction was on the bottom face of the block, return if it was
  const blockFace = eventData.blockFace;
  if (blockFace === Direction.Down) return;
  if (player.isSneaking) return;

  // Ensure the player is on the ground and the block height difference is less than 3
  const playerY = Math.floor(player.location.y);
  if (!player.isOnGround || Math.abs(blockLocation.y - playerY) >= 3) {
    return;
  }

  // Check if there is already a seat entity at this block location
  const isSeatPresent = dimension.getEntities().some(entity => {
    if (entity.typeId === "fa:seat") {
      const entityLocation = entity.location;
      return (
        Math.floor(entityLocation.x) === Math.floor(blockLocation.x) &&
        Math.floor(entityLocation.y) === Math.floor(blockLocation.y) &&
        Math.floor(entityLocation.z) === Math.floor(blockLocation.z)
      );
    }
    return false;
  });

  if (isSeatPresent) return;

  // Add the player to the cooldown set to prevent repeated seating
  const playerId = player.id;
  if (cooldowns.has(playerId)) return;

  cooldowns.add(playerId);
  system.runTimeout(() => cooldowns.delete(playerId), cooldownDuration);

  // Spawn the seat entity with the correct rotation after a short delay
  system.runTimeout(() => {
    const blockPermutation = currentBlock.permutation;
    const cardinalDirection = blockPermutation.getState("minecraft:cardinal_direction");

    // Set the seat rotation based on the block's cardinal direction
    let seatRotation = 0;
    switch (cardinalDirection) {
      case "north":
        seatRotation = 0;
        break;
      case "west":
        seatRotation = 270;
        break;
      case "south":
        seatRotation = 180;
        break;
      case "east":
        seatRotation = 90;
        break;
      default:
        seatRotation = 0;
        break;
    }

    // Spawn the seat entity at the block's location
    const seat = dimension.spawnEntity("fa:seat", {
      x: blockLocation.x + 0.5,
      y: blockLocation.y,
      z: blockLocation.z + 0.5,
    });

    // Set the seat's rotation and add the player as a rider
    seat.setRotation({ x: 0, y: seatRotation });
    seat.getComponent("rideable").addRider(player);
    activeSeats.set(seat.id, blockLocation);

    // Periodically check if the seat is still valid
    const checkInterval = system.runInterval(() => {
      const seatEntity = world.getEntity(seat.id);
      if (!seatEntity) {
        system.clearRun(checkInterval);
        return;
      }

      // Check if the block the seat is on has been removed
      const currentBlock = dimension.getBlock(activeSeats.get(seat.id));
      const isBlockRemoved = currentBlock.typeId === "minecraft:air" ||
                             currentBlock.typeId === "minecraft:water" ||
                             currentBlock.typeId === "minecraft:lava";

      // Check if there are any nearby players to keep the seat active
      const nearbyPlayers = world.getPlayers().filter(p => {
        const distance = Math.sqrt(
          Math.pow(p.location.x - seatEntity.location.x, 2) +
          Math.pow(p.location.y - seatEntity.location.y, 2) +
          Math.pow(p.location.z - seatEntity.location.z, 2)
        );
        return distance <= 0.5;
      });

      // Remove the seat if the block was removed or no players are nearby
      if (isBlockRemoved || nearbyPlayers.length === 0) {
        seatEntity.remove();
        activeSeats.delete(seat.id);
        system.clearRun(checkInterval);
      }
    }, 10);  // Check every 10 ticks
  }, 5);  // Delay the seat spawning by 5 ticks
});

// Event listener for when an entity is hurt (e.g., player takes damage)
world.afterEvents.entityHurt.subscribe((eventData) => {
  const entity = eventData.hurtEntity;

  // Only run if the entity hurt is a player
  if (entity.typeId !== "minecraft:player") return;

  const player = entity;
  const dimension = world.getDimension(player.dimension.id);
  const seatEntities = dimension.getEntities()
    .filter(e => e.typeId === "fa:seat");

  // Remove any seat entities near the player when they are hurt
  seatEntities.forEach(seatEntity => {
    const distance = Math.sqrt(
      Math.pow(player.location.x - seatEntity.location.x, 2) +
      Math.pow(player.location.y - seatEntity.location.y, 2) +
      Math.pow(player.location.z - seatEntity.location.z, 2)
    );
    if (distance <= 0.5) {
      seatEntity.remove();
    }
  });
});
