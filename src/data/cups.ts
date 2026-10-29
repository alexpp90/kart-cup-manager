// verify names
// Cup and track names for the cup picker. This is plain text data only (no logos
// or artwork). The organizer may correct spellings here; ids must stay unique.

export interface Cup {
  id: string;
  name: string;
  booster: boolean;
  /** Small original glyph shown on the cup card. */
  glyph: string;
  tracks: string[];
}

export const CUPS: Cup[] = [
  // Base game
  { id: 'mushroom', name: 'Mushroom Cup', booster: false, glyph: '🍄', tracks: ['Mario Kart Stadium', 'Water Park', 'Sweet Sweet Canyon', 'Thwomp Ruins'] },
  { id: 'flower', name: 'Flower Cup', booster: false, glyph: '🌼', tracks: ['Mario Circuit', 'Toad Harbor', 'Twisted Mansion', 'Shy Guy Falls'] },
  { id: 'star', name: 'Star Cup', booster: false, glyph: '⭐', tracks: ['Sunshine Airport', 'Dolphin Shoals', 'Electrodrome', 'Mount Wario'] },
  { id: 'special', name: 'Special Cup', booster: false, glyph: '👑', tracks: ['Cloudtop Cruise', 'Bone-Dry Dunes', "Bowser's Castle", 'Rainbow Road'] },
  { id: 'shell', name: 'Shell Cup', booster: false, glyph: '🐚', tracks: ['Wii Moo Moo Meadows', 'GBA Mario Circuit', 'DS Cheep Cheep Beach', "N64 Toad's Turnpike"] },
  { id: 'banana', name: 'Banana Cup', booster: false, glyph: '🍌', tracks: ['GCN Dry Dry Desert', 'SNES Donut Plains 3', 'N64 Royal Raceway', '3DS DK Jungle'] },
  { id: 'leaf', name: 'Leaf Cup', booster: false, glyph: '🍃', tracks: ['DS Wario Stadium', 'GCN Sherbet Land', '3DS Music Park', 'N64 Yoshi Valley'] },
  { id: 'lightning', name: 'Lightning Cup', booster: false, glyph: '⚡', tracks: ['DS Tick-Tock Clock', '3DS Piranha Plant Slide', 'Wii Grumble Volcano', 'N64 Rainbow Road'] },
  { id: 'egg', name: 'Egg Cup', booster: false, glyph: '🥚', tracks: ['GCN Yoshi Circuit', 'Excitebike Arena', 'Dragon Driftway', 'Mute City'] },
  { id: 'triforce', name: 'Triforce Cup', booster: false, glyph: '🔺', tracks: ["Wii Wario's Gold Mine", 'SNES Rainbow Road', 'Ice Ice Outpost', 'Hyrule Circuit'] },
  { id: 'crossing', name: 'Crossing Cup', booster: false, glyph: '🌳', tracks: ['GCN Baby Park', 'GBA Cheese Land', 'Wild Woods', 'Animal Crossing'] },
  { id: 'bell', name: 'Bell Cup', booster: false, glyph: '🔔', tracks: ['3DS Neo Bowser City', 'GBA Ribbon Road', 'Super Bell Subway', 'Big Blue'] },
  // Booster Course Pass
  { id: 'golden-dash', name: 'Golden Dash Cup', booster: true, glyph: '🏁', tracks: ['Tour Paris Promenade', '3DS Toad Circuit', 'N64 Choco Mountain', 'Wii Coconut Mall'] },
  { id: 'lucky-cat', name: 'Lucky Cat Cup', booster: true, glyph: '🐱', tracks: ['Tour Tokyo Blur', 'DS Shroom Ridge', 'GBA Sky Garden', 'Ninja Hideaway'] },
  { id: 'turnip', name: 'Turnip Cup', booster: true, glyph: '🥕', tracks: ['Tour New York Minute', 'SNES Mario Circuit 3', 'N64 Kalimari Desert', 'DS Waluigi Pinball'] },
  { id: 'propeller', name: 'Propeller Cup', booster: true, glyph: '🌀', tracks: ['Tour Sydney Sprint', 'GBA Snow Land', 'Wii Mushroom Gorge', 'Sky-High Sundae'] },
  { id: 'rock', name: 'Rock Cup', booster: true, glyph: '🪨', tracks: ['Tour London Loop', 'GBA Boo Lake', '3DS Rock Rock Mountain', 'Wii Maple Treeway'] },
  { id: 'moon', name: 'Moon Cup', booster: true, glyph: '🌙', tracks: ['Tour Berlin Byways', 'DS Peach Gardens', 'Merry Mountain', '3DS Rainbow Road'] },
  { id: 'fruit', name: 'Fruit Cup', booster: true, glyph: '🍒', tracks: ['Tour Amsterdam Drift', 'GBA Riverside Park', 'Wii DK Summit', "Yoshi's Island"] },
  { id: 'boomerang', name: 'Boomerang Cup', booster: true, glyph: '🪃', tracks: ['Tour Bangkok Rush', 'DS Mario Circuit', 'GCN Waluigi Stadium', 'Tour Singapore Speedway'] },
  { id: 'feather', name: 'Feather Cup', booster: true, glyph: '🪶', tracks: ['Tour Athens Dash', 'GCN Daisy Cruiser', 'Wii Moonview Highway', 'Squeaky Clean Sprint'] },
  { id: 'cherry', name: 'Cherry Cup', booster: true, glyph: '🌸', tracks: ['Tour Los Angeles Laps', 'GBA Sunset Wilds', 'Wii Koopa Cape', 'Tour Vancouver Velocity'] },
  { id: 'acorn', name: 'Acorn Cup', booster: true, glyph: '🌰', tracks: ['Tour Rome Avanti', 'GCN DK Mountain', 'Wii Daisy Circuit', 'Piranha Plant Cove'] },
  { id: 'spiny', name: 'Spiny Cup', booster: true, glyph: '🦔', tracks: ['Tour Madrid Drive', "3DS Rosalina's Ice World", 'SNES Bowser Castle 3', 'Wii Rainbow Road'] },
];
