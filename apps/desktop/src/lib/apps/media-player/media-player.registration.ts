export const registration = {
  id: 'media-player',
  name: 'Media Player',
  icon: 'player',
  kind: 'canvas',
  route: '/apps/media-player/',
  title: 'Media Player',
  w: 380,
  h: 242,
  menu: 'Programs',
  register: 'L2',
  files: [
    {
      extensions: ['.wav', '.mp3', '.ogg', '.m4a', '.flac'],
      description: 'Audio file',
      category: 'audio',
    },
  ],
  handlerLabel: 'Media Player',
  startMenuFolder: 'multimedia',
  runAliases: ['mplayer'],
} as const;
