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

// Define cooldown set and active seats map for managing cooldowns and seat entities.
const cooldowns = new Set();
const activeSeats = new Map();
const cooldownDuration = 5;

// Define item names that are invalid for interacting with chairs.
const invalidItemNames = [
    "debug", "bucket", "spawn_egg", "steel", "chair"
];

// Initialize the script and run a cleanup function to remove leftover seat entities.
const initializeScript = () => {
  console.warn("§g§lChairs§r§a loaded§r");

  system.runTimeout(() => {
    const dimensions = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
    dimensions.forEach(dimensionName => {
      const dimension = world.getDimension(dimensionName);
      const seatEntities = dimension.getEntities().filter(entity => entity.typeId === "xassassin:seat");
      seatEntities.forEach(seatEntity => seatEntity.kill());
    });
  }, 1);
};

initializeScript();

// Subscribe to itemUseOn events to detect chair interactions.
world.beforeEvents.itemUseOn.subscribe((eventData) => {
  const player = eventData.source;
  const blockLocation = eventData.block.location;
  const dimension = world.getDimension(player.dimension.id);

  // Check if the item in the player's hand is invalid for interacting with a chair.
  const item = player.getComponent("inventory").container.getItem(player.selectedSlotIndex);
  if (!item) return;
  const itemName = item.typeId.toLowerCase();

  if (invalidItemNames.some(name => itemName.includes(name))) return;

  // Check if the current block is a chair.
  const currentBlock = dimension.getBlock(blockLocation);

  if (!currentBlock.typeId.includes("chair")) {
    return;
  }

  // If the player is sneaking, do not cancel the event.
  if (!player.isSneaking) {
    eventData.cancel = true;
  } else {
    return;
  }

  // Check if the block above the chair is breathable.
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

  // If interacting with the block from below, don't place the player in the chair.
  const blockFace = eventData.blockFace;
  if (blockFace === Direction.Down) return;

  // Ensure the player is close enough to the block location and on the ground.
  const playerY = Math.floor(player.location.y);
  if (!player.isOnGround || Math.abs(blockLocation.y - playerY) >= 3) {
    return;
  }

  // Check if a seat entity already exists at this block location.
  const seatEntity = dimension.getEntities().find(entity => 
    entity.typeId === "xassassin:seat" && 
    Math.floor(entity.location.x) === Math.floor(blockLocation.x) &&
    Math.floor(entity.location.y) === Math.floor(blockLocation.y) &&
    Math.floor(entity.location.z) === Math.floor(blockLocation.z)
  );

  if (seatEntity) {
    // Check if there is a player within 0.25 blocks of the seat entity.
    const nearbyPlayers = world.getPlayers().filter(p => {
      const distance = Math.sqrt(
        Math.pow(p.location.x - seatEntity.location.x, 2) +
        Math.pow(p.location.y - seatEntity.location.y, 2) +
        Math.pow(p.location.z - seatEntity.location.z, 2)
      );
      return distance <= 0.25;
    });

    // If no players are nearby, schedule the seat entity for removal.
    if (nearbyPlayers.length === 0) {
      system.runTimeout(() => {
        seatEntity.remove();
      }, 5);
    } else {
      return;
    }
  }

  // If the player is in cooldown, don't allow further interactions.
  const playerId = player.id;
  if (cooldowns.has(playerId)) return;

  cooldowns.add(playerId);
  system.runTimeout(() => cooldowns.delete(playerId), cooldownDuration);

  // Delay the spawn of the seat entity slightly.
  system.runTimeout(() => {
    // Determine the seat entity's rotation based on the chair's direction.
    const blockPermutation = currentBlock.permutation;
    const cardinalDirection = blockPermutation.getState("minecraft:cardinal_direction");

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

    // Spawn the seat entity at the chair location and make the player sit on it.
    const seat = dimension.spawnEntity("xassassin:seat", {
      x: blockLocation.x + 0.5,
      y: blockLocation.y,
      z: blockLocation.z + 0.5,
    });

    seat.setRotation({ x: 0, y: seatRotation });
    seat.getComponent("rideable").addRider(player);
    activeSeats.set(seat.id, blockLocation);

    // Check regularly if the seat entity should be removed.
    const checkInterval = system.runInterval(() => {
      const seatEntity = world.getEntity(seat.id);
      if (!seatEntity) {
        system.clearRun(checkInterval);
        return;
      }

      const currentBlock = dimension.getBlock(activeSeats.get(seat.id));
      const isBlockRemoved = currentBlock.typeId === "minecraft:air" ||
                             currentBlock.typeId === "minecraft:water" ||
                             currentBlock.typeId === "minecraft:lava";

      // Check if a player is within 0.5 blocks of the seat entity.
      const nearbyPlayers = world.getPlayers().filter(p => {
        const distance = Math.sqrt(
          Math.pow(p.location.x - seatEntity.location.x, 2) +
          Math.pow(p.location.y - seatEntity.location.y, 2) +
          Math.pow(p.location.z - seatEntity.location.z, 2)
        );
        return distance <= 0.5;
      });

      // Remove the seat entity if the chair is removed or no players are nearby.
      if (isBlockRemoved || nearbyPlayers.length === 0) {
        system.runTimeout(() => {
          seatEntity.remove();
        }, 5);
        activeSeats.delete(seat.id);
        system.clearRun(checkInterval);
      }
    }, 10);
  }, 5);
});

// Handle entityHurt events to remove seat entities when nearby players are hurt.
world.afterEvents.entityHurt.subscribe((eventData) => {
  const entity = eventData.hurtEntity;

  if (entity.typeId !== "minecraft:player") return;

  const player = entity;
  const dimension = world.getDimension(player.dimension.id);
  const seatEntities = dimension.getEntities()
    .filter(e => e.typeId === "xassassin:seat");

  seatEntities.forEach(seatEntity => {
    const distance = Math.sqrt(
      Math.pow(player.location.x - seatEntity.location.x, 2) +
      Math.pow(player.location.y - seatEntity.location.y, 2) +
      Math.pow(player.location.z - seatEntity.location.z, 2)
    );
    if (distance <= 0.5) {
      system.runTimeout(() => {
        seatEntity.remove();
      }, 5);
    }
  });
});
});
