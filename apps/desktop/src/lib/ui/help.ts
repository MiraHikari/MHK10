/** Copy shared by the desktop, Welcome, application Help and the monitor bezel. */
export const HELP_TOPICS = {
  desktop: {
    title: 'Desktop Help',
    lines: [
      'Double-click an icon, or select it and press Enter.',
      'Ctrl+Esc opens Start. F10 selects the application menu bar.',
      'Drag a title bar to move a window.',
      'Double-click a title bar to maximize or restore.',
      'Ctrl+F4 closes the active window. Escape dismisses menus.',
      'Ctrl+Tab switches windows. Ctrl+Shift+Esc opens Task Manager.',
      'Alt+F2 opens Run. Ctrl+Alt+D shows or restores the desktop.',
    ],
  },
  files: {
    title: 'Files and Folders',
    lines: [
      'Double-click or Enter opens the selected item.',
      'F2 renames a file. Delete moves it to Recycle Bin.',
      'File > New creates a document in the current folder.',
      'Notepad saves changes to My Documents.',
      'File > Export creates a copy you can keep.',
      'Alt+Left / Right: history. Alt+Up: parent folder.',
      'Ctrl+Shift+N: new folder. Ctrl+C / X / V: copy, cut, paste.',
    ],
  },
  chat: {
    title: 'Chat Help',
    lines: [
      'Type in Message in English or Chinese. Try: 打开计算器.',
      'Desktop guide is local. Guide and app commands never go online.',
      'Choose Online with the shown host to send to that service.',
      'Enter sends after composition. Stop keeps any text already received.',
      'Use the wheel or scrollbar to browse history. Edit copies text.',
      'File saves in My Documents or exports a complete text copy.',
      'Minimize to keep this chat. Save or export before closing.',
    ],
  },
  recovery: {
    title: 'Archive Help',
    lines: [
      'Select an archive to inspect the surviving fragment.',
      'Recover file marks the archive safe.',
      'Recover all five archives for a curator certificate.',
      'Recovery Console reviews ownership and permissions.',
    ],
  },
} as const;

/** A finite introduction; operating instructions remain in the Help topics above. */
export const TOUR_STOPS = [
  {
    title: 'MiraHikari’s desktop',
    text: 'Home brings together MiraHikari’s work, photographs and notes. Personal pages remain available throughout your visit.',
    app: 'home',
    action: 'Open Home',
  },
  {
    title: 'Your documents',
    text: 'My Documents holds the notes and pictures you save. The personal pages belong to MiraHikari; your documents are kept separately.',
    app: 'computer',
    action: 'My Documents',
  },
  {
    title: 'Desktop preferences',
    text: 'Choose the appearance, sound and startup behavior in Control Panel. Changes to preferences keep your documents intact.',
    app: 'control-panel',
    action: 'Control Panel',
  },
  {
    title: 'System tools',
    text: 'Recovery Console reviews system permissions. It is optional and separate from this introduction. Help remains available from Start.',
    app: 'recovery',
    action: 'Recovery Console',
  },
] as const;

export const DESKTOP_MANUAL = [
  ...HELP_TOPICS.desktop.lines,
  '',
  ...HELP_TOPICS.files.lines,
  '',
  ...HELP_TOPICS.chat.lines,
].join('\n');

export const BEZEL_HELP = [
  { title: 'Explore and windows', text: HELP_TOPICS.desktop.lines.join(' ') },
  { title: 'Files', text: HELP_TOPICS.files.lines.join(' ') },
  {
    title: 'Keyboard',
    text: 'Click the desktop first. Tab moves to the monitor controls. Keyboard opens a text field for composing and inserting text into the active application.',
  },
  {
    title: 'Display',
    text: 'Pixel scale keeps pixels evenly sized. Turn it off to fill the available browser area. CRT toggles scanlines. Display Properties changes the desktop theme.',
  },
  {
    title: 'Sound',
    text: 'The speaker beside the clock opens Volume Control. Audio starts after your first click or key press.',
  },
  {
    title: 'Touch',
    text: 'Double-tap to open, or select an icon and use Open. Zoom offers Fit, 100% and 200%. Pan moves around a magnified desktop. The right-click key arms the next tap.',
  },
  {
    title: 'Privacy',
    text: 'Properties Contact opens the Privacy article. Reader Discussion opens a themed GitHub Discussions window. Desktop settings, files and notes stay in this browser until you clear site data.',
  },
  {
    title: 'Mobile keyboard',
    text: 'Select a text field, open Keyboard, compose your text and choose Insert text. Enter / Send sends a chat message or adds a diary line.',
  },
] as const;
