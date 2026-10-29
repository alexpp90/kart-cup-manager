// Original avatar set: an emoji "driver" inside a self-drawn SVG racing helmet.
export interface AvatarDef {
  id: string;
  emoji: string;
  label: string;
}

export const AVATARS: AvatarDef[] = [
  { id: 'fox', emoji: '🦊', label: 'Fox' },
  { id: 'frog', emoji: '🐸', label: 'Frog' },
  { id: 'panda', emoji: '🐼', label: 'Panda' },
  { id: 'tiger', emoji: '🐯', label: 'Tiger' },
  { id: 'monkey', emoji: '🐵', label: 'Monkey' },
  { id: 'penguin', emoji: '🐧', label: 'Penguin' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn' },
  { id: 'octopus', emoji: '🐙', label: 'Octopus' },
  { id: 'dragon', emoji: '🐲', label: 'Dragon' },
  { id: 'bear', emoji: '🐻', label: 'Bear' },
  { id: 'koala', emoji: '🐨', label: 'Koala' },
  { id: 'bunny', emoji: '🐰', label: 'Bunny' },
  { id: 'cat', emoji: '🐱', label: 'Cat' },
  { id: 'dog', emoji: '🐶', label: 'Dog' },
  { id: 'lion', emoji: '🦁', label: 'Lion' },
  { id: 'pig', emoji: '🐷', label: 'Pig' },
  { id: 'dino', emoji: '🦖', label: 'Dino' },
  { id: 'turtle', emoji: '🐢', label: 'Turtle' },
  { id: 'owl', emoji: '🦉', label: 'Owl' },
  { id: 'bee', emoji: '🐝', label: 'Bee' },
  { id: 'ghost', emoji: '👻', label: 'Ghost' },
  { id: 'robot', emoji: '🤖', label: 'Robot' },
  { id: 'alien', emoji: '👽', label: 'Alien' },
  { id: 'cool', emoji: '😎', label: 'Cool' },
];

export const COLORS = ['#E60012', '#FF7A00', '#FFC81E', '#3CB44B', '#0BB5A8', '#2F7DE1', '#6A4CE0', '#D63CA8', '#8B5A2B', '#14213D', '#7A8699', '#FFFFFF'];

export const avatarEmoji = (id: string) => AVATARS.find((a) => a.id === id)?.emoji ?? '🏎️';
