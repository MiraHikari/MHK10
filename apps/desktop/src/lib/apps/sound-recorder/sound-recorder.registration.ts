export const registration = {
  id: 'sound-recorder',
  name: 'Sound Recorder',
  icon: 'microphone',
  kind: 'canvas',
  route: '/apps/sound-recorder/',
  title: 'Sound Recorder',
  w: 390,
  h: 254,
  menu: 'Programs',
  register: 'L2',
  files: [
    { extensions: ['.snd.txt', '.snd'], description: 'Sound recording', category: 'recording' },
  ],
  handlerLabel: 'Sound Recorder',
  startMenuFolder: 'multimedia',
  runAliases: ['sndrec32'],
} as const;
