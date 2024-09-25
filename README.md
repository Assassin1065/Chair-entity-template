
---

# xAssassin's Wrenches

This Minecraft Bedrock Edition addon introduces a variety of custom wrenches that allow players to interact with certain block properties. The wrenches can modify specific aspects of blocks, offering greater flexibility and control over block configurations. The addon also implements a durability system for the wrenches, which wear down as the player uses them.

## Features

- **Custom Wrenches**: Adds multiple types of wrenches (stone, copper, iron, gold, diamond, netherite) that can modify specific block properties by right-clicking or hitting blocks.
- **Blockstate Modification**: Modify allowed block states to adjust block behavior and orientation.
- **Durability**: Each wrench has limited durability and will break when used extensively in survival mode.
- **Block Info Display**: Sneaking while using the wrench shows detailed information about the block and its properties.
- **Sound Effects**: Custom sounds play when interacting with blocks using the wrench, or when hitting a block to cycle blockstates.

## Available Wrenches

The addon includes the following types of wrenches, all functioning identically and sharing the `xassassin:wrench` item tag:

- Stone Wrench
- Copper Wrench
- Iron Wrench
- Gold Wrench
- Diamond Wrench
- Netherite Wrench

Each wrench has its own durability based on its material.

## Allowed Block States

The wrenches can modify a limited set of block properties. The following block states are supported:

- `minecraft:cardinal_direction`
- `attachment`
- `door_hinge_bit`
- `wall_connection_type_west`
- `wall_connection_type_south`
- `wall_connection_type_north`
- `wall_connection_type_east`
- `top_slot_bit`
- `upside_down_bit`
- `weirdo_direction`
- `vertical_half`
- `pillar_axis`
- `attached_bit`
- `lit`
- `facing`
- `facing_direction`
- `wall_post_bit`
- `ground_sign_direction`
- `hanging`

## Excluded Blocks

The wrenches cannot modify certain blocks, such as:

- Wall banners
- Buttons
- Levers
- Wall signs

## Usage

### Right-click (Item Use)

- **Right-clicking on a block** with the wrench will either modify the block's property or display its current state (when sneaking).
- **Cooldown**: Players must wait for a brief cooldown period (4 ticks) before the wrench can be used again.

### Block Breaking

- When a player **breaks a block** using the wrench, the block's property is cycled, and the wrench takes damage.

### Block Hitting

- Hitting a block with the wrench will cycle through its available properties and play a sound.

## Sneak to View Block Info

- Sneaking while using the wrench displays detailed block information, including its type, coordinates, and the states of its modifiable properties.

## Durability System

- Each wrench has durability, and its damage will increase with each use. Once its durability reaches the limit, the wrench will break.

## Cooldown System

- To prevent excessive use, the wrench has a built-in cooldown of 4 ticks (0.2 seconds) between uses.

## License

This project is licensed under the MIT License. See the `LICENSE` file for more details.

## Contribution

Feel free to submit issues or pull requests if you'd like to contribute to the development of this addon.

---
