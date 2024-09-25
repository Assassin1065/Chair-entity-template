/*============================================================================*\
+*
+* This project uses the core of the debug stick add-on for Minecraft: Bedrock Edition
+*
+* Official links to that project:
+* MCPEDL: https://mcpedl.com/debug-stick
+* GitHub: https://github.com/vytdev/debug-stick
+*
+* Official links:
+* MCPEDL: https://mcpedl.com/Assassins-Wrenches
+* GitHub: https://github.com/Assassin1065/xAssassin-s-Wrenches
+*
+* Copyright (c) 2023-2024 VYT <https://vytdev.github.io>
+* Copyright (c) 2024 xAssassin <https://Assassin1065.github.io>
+* This project is licensed under the MIT License, as well as the project it's built on. This project was made with explicit permission by the original copyright holder and complies with the terms in the MIT License.
+* See LICENSE for more details.
+* See Credits.txt for a list of contributors. Thank you to all of them for making this project possible.
+*
\*============================================================================*/

import { world, EquipmentSlot, BlockStates, system } from "@minecraft/server";

// Record to store the player's currently selected block property
const record = {}; 
// Record to store the cooldown time for each player
const cooldowns = {}; 

// List of allowed block states that can be modified by the wrench
const allowedStates = [
    "minecraft:cardinal_direction", "attachment", "door_hinge_bit", 
    "wall_connection_type_west", "wall_connection_type_south", 
    "wall_connection_type_north", "wall_connection_type_east", 
    "top_slot_bit", "upside_down_bit", "weirdo_direction", 
    "vertical_half", "pillar_axis", "attachment", 
    "attached_bit", "lit", "facing", "facing_direction", "minecraft:facing_direction", "wall_post_bit", 
    "ground_sign_direction", "hanging", "open_bit", "orientation", "direction", "minecraft:direction", "rail_direction"
];

// Sends a message to the player's actionbar
function message(msg, player) {
    player.runCommandAsync(`titleraw @s actionbar {"rawtext":[{"text":${JSON.stringify(msg)}}]}`).catch(() => {});
}

// Checks if the player is holding an item tagged as "xassassin:wrench"
function isHoldingWrench(player) {
    const mainhand = player.getComponent('minecraft:equippable');
    const item = mainhand.getEquipment(EquipmentSlot.Mainhand);
    return item && item.hasTag("xassassin:wrench"); 
}

// Damages the item in the player's main hand and breaks it if its durability reaches zero
function damageItem(item, player) {
    if (item && item.hasComponent("minecraft:durability") && player.getGameMode() !== 'creative') {
        const durabilityComponent = item.getComponent("minecraft:durability");
        durabilityComponent.damage += 1; // Increment damage by 1
        
        // Check if the item has reached its max durability (i.e., broken)
        if (durabilityComponent.damage >= durabilityComponent.maxDurability) {
            // Remove the item from the player's main hand and play the break sound
            player.getComponent('minecraft:equippable').setEquipment(EquipmentSlot.Mainhand, null); 
            player.playSound("random.break");
        } else {
            // Update the item with increased damage value
            const mainhand = player.getComponent('minecraft:equippable');
            mainhand.setEquipment(EquipmentSlot.Mainhand, item);
        }
    }
}

// Checks if enough time has passed since the player's last interaction (cooldown system)
function hasCooldownExpired(player) {
    const currentTime = system.currentTick;
    const lastUse = cooldowns[player.id] || 0;
    const cooldownDuration = 4; // Cooldown of 4 ticks
    
    // If the cooldown has expired, update the player's cooldown time and return true
    if (currentTime - lastUse >= cooldownDuration) {
        cooldowns[player.id] = currentTime;
        return true;
    }
    return false;
}

// Event handler for using an item on a block
world.beforeEvents.itemUseOn.subscribe(ev => {
    const player = world.getAllPlayers().find(v => v.id == ev.source.id);
    if (ev.source.typeId !== "minecraft:player" || !ev.itemStack?.hasTag("xassassin:wrench")) return;

    // Ensure the cooldown has expired before proceeding
    if (!hasCooldownExpired(player)) return;

    const block = ev.block;
    const blockTypeId = block.typeId; // Use typeId to get the block's identifier

    // Return if the block's typeId includes "smithing", "frame", or "vault"
    if (blockTypeId.includes("smithing") || blockTypeId.includes("frame") || blockTypeId.includes("shulker") || blockTypeId.includes("button") || blockTypeId.includes("crafting_table") || blockTypeId.includes("vault")) {
        return;
    }

    ev.cancel = true; // Cancel default behavior

    const hasProperties = blockHasValidProperties(block);

    // Delay by 5 ticks to check for the wrench and damage the item
    system.runTimeout(() => {
        if (isHoldingWrench(player) && hasProperties) {
            const mainhand = player.getComponent('minecraft:equippable');
            const item = mainhand.getEquipment(EquipmentSlot.Mainhand);
            if (item && player.getGameMode() !== 'creative') damageItem(item, player);
        }
        player.playSound("break.heavy_core"); // Play a sound when the wrench is used
    }, 5);

    // If the player is sneaking, display block info; otherwise, modify the block's property
    if (player.isSneaking) {
        displayBlockInfo(player, block);
    } else if (hasProperties && !isExcludedBlock(block)) {
        updateBlockProperty(player, block);
    }
});

// Event handler for breaking a block
world.afterEvents.playerBreakBlock.subscribe(eventData => {
    const player = eventData.player;
    const block = eventData.block;

    // If the player is holding a wrench and the block is not excluded, damage the wrench
    if (isHoldingWrench(player) && !isExcludedBlock(block)) {
        const mainhand = player.getComponent('minecraft:equippable');
        const item = mainhand.getEquipment(EquipmentSlot.Mainhand);
        if (item) damageItem(item, player);
    }
});

// Event handler for hitting a block
world.afterEvents.entityHitBlock.subscribe(ev => {
    if (ev.damagingEntity.typeId !== "minecraft:player") return;
    const player = world.getAllPlayers().find(v => v.id == ev.damagingEntity.id);
    const block = ev.hitBlock;

    // Ensure the player is holding a wrench before proceeding
    if (!isHoldingWrench(player)) return;

    player.playSound("break.heavy_core"); // Play a sound when the wrench hits the block

    // Change the selected property of the block if it has valid modifiable properties
    if (blockHasValidProperties(block) && !isExcludedBlock(block)) {
        changeSelectedProperty(player, block);
    }
});

// Function to cycle through allowed block properties and select the next one
function changeSelectedProperty(player, block) {
    const permutation = block.permutation;
    const states = permutation.getAllStates();
    let names = Object.keys(states).filter(name => allowedStates.includes(name)); 

    if (!names.length) return;

    // Exclude "facing_direction" for furnace-like blocks
    if (block.typeId.includes("furnace") || block.typeId.includes("chest") || block.typeId.includes("observer") || block.typeId.includes("smoker")) {
        const index = names.indexOf("facing_direction");
        if (index > -1) names.splice(index, 1);
    }

    // Cycle through the list of properties and select the next one
    let prop = names[names.indexOf(record[player.id]) + 1];
    let val = states[prop];

    if (!prop) {
        prop = names[0];
        val = states[prop];
    }

    record[player.id] = prop; // Store the selected property for the player
    message(`selected "${prop}" (${val})`, player); // Send a message to the player about the selected property
}

// Function to update the block's selected property to the next valid value
function updateBlockProperty(player, block) {
    const permutation = block.permutation;
    const states = permutation.getAllStates();
    let names = Object.keys(states).filter(name => allowedStates.includes(name)); 

    if (!names.length) {
        message("No properties to change.", player);
        return;
    }

    // Exclude "facing_direction" for furnace-like blocks
    if (block.typeId.includes("furnace", "smoker", "chest", "observer")) {
        const index = names.indexOf("facing_direction");
        if (index > -1) names.splice(index, 1);
    }

    let prop = record[player.id];
    let val;

    if (!names.includes(prop)) prop = names[0];

    const isHopper = block.typeId === "minecraft:hopper";

    // Handle the special case for hoppers
    if (prop === "facing_direction") {
        if (isHopper && states[prop] === 0) {
            val = 2; // Set hopper facing down to face north
        } else {
            const valids = BlockStates.get(prop).validValues;
            val = valids[valids.indexOf(states[prop]) + 1];
            if (typeof val === "undefined") val = valids[0];
        }
    } else {
        // For other block states, cycle to the next valid value
        const valids = BlockStates.get(prop).validValues;
        val = valids[valids.indexOf(states[prop]) + 1];
        if (typeof val === "undefined") val = valids[0];
    }

    // Update the block with the new state value
    system.run(() => {
        block.setPermutation(permutation.withState(prop, val));
    });

    record[player.id] = prop; // Store the selected property for the player
    message(`"${prop}" to ${val}`, player); // Send a message about the updated property value
}

// Checks if a block has any valid modifiable properties from the allowed states
function blockHasValidProperties(block) {
    const states = block.permutation.getAllStates();
    return Object.keys(states).some(name => allowedStates.includes(name));
}

// Checks if a block is excluded from modification (e.g., banners, buttons, levers, and wall signs)
function isExcludedBlock(block) {
    return block.typeId.includes("wall_banner") || block.typeId.includes("button") || block.typeId.includes("ladder") || block.typeId.includes("lever") || block.typeId.includes("wall_sign");
}

// Function to display block information
function displayBlockInfo(player, block) {
    let info = "§l§b" + block.typeId + "§r";
    info += "\n§4" + block.x + " §a" + block.y + " §9" + block.z;
    
    // Display only the allowed states
    Object.entries(block.permutation.getAllStates()).forEach(([k, v]) => {
        if (allowedStates.includes(k)) {
            info += "\n§o§7" + k + "§r§8: ";
            if (typeof v === "string") info += "§e";
            if (typeof v === "number") info += "§3";
            if (typeof v === "boolean") info += "§6";
            info += v;
        }
    });

    message(info, player); // Display the info message
        }
