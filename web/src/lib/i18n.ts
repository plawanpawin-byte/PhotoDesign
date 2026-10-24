// Interface language. Strings are written in English at the call site, `t('Open an image')`,
// and looked up in the active language's table; anything without a translation shows in English.

export type Lang = 'en' | 'th';

export const LANGUAGES: readonly { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'th', label: 'ไทย' },
];

const STORE_KEY = 'photodesign.lang';
let current: Lang = 'en';
const listeners = new Set<() => void>();

/** Thai. Keys are the English source strings. */
export const TH: Record<string, string> = {
  // top bar
  Menu: 'เมนู',
  'Find an action…': 'ค้นหาคำสั่ง…',
  Export: 'ส่งออก',
  'New document (Ctrl+N)': 'เอกสารใหม่ (Ctrl+N)',
  'Undo (Ctrl+Z)': 'เลิกทำ (Ctrl+Z)',
  'Redo (Ctrl+Shift+Z)': 'ทำซ้ำ (Ctrl+Shift+Z)',
  'Find any action (Ctrl+K)': 'ค้นหาคำสั่งทั้งหมด (Ctrl+K)',
  'Unsaved changes': 'ยังไม่ได้บันทึก',
  Close: 'ปิด',
  'Close without exporting? Unsaved changes will be lost.': 'ปิดโดยไม่ส่งออก? การแก้ไขที่ยังไม่บันทึกจะหายไป',
  Language: 'ภาษา',
  'PNG image': 'ภาพ PNG',
  'JPEG photo': 'ภาพถ่าย JPEG',
  'WebP image': 'ภาพ WebP',
  'Photoshop document': 'เอกสาร Photoshop',
  'TIFF image': 'ภาพ TIFF',
  'PhotoDesign document (.pcraft)': 'เอกสาร PhotoDesign (.pcraft)',
  // tools
  Brush: 'พู่กัน',
  Eraser: 'ยางลบ',
  Fill: 'เทสี',
  'Pick colour': 'ดูดสี',
  Pan: 'เลื่อนภาพ',
  Zoom: 'ซูม',
  Marquee: 'เลือกสี่เหลี่ยม',
  Ellipse: 'เลือกวงรี',
  Lasso: 'เลือกอิสระ',
  'Magic wand': 'เลือกตามสี',
  Gradient: 'ไล่สี',
  Crop: 'ครอป',
  'Paint with the foreground colour': 'วาดด้วยสีหน้า',
  'Erase to transparency': 'ลบให้โปร่งใส',
  'Fill similar colours with the foreground': 'เทสีหน้าลงบนบริเวณสีใกล้เคียง',
  'Pick a colour from the image': 'ดูดสีจากภาพ',
  'Drag to move around · hold Space': 'ลากเพื่อเลื่อนภาพ · กด Space ค้างไว้',
  'Click to zoom in, Alt-click to zoom out': 'คลิกเพื่อขยาย, Alt+คลิกเพื่อย่อ',
  'Drag to select a rectangle': 'ลากเพื่อเลือกพื้นที่สี่เหลี่ยม',
  'Drag to select an ellipse': 'ลากเพื่อเลือกพื้นที่วงรี',
  'Draw around an area to select it': 'วาดวนรอบพื้นที่ที่ต้องการเลือก',
  'Click to select similar colours': 'คลิกเพื่อเลือกสีที่ใกล้เคียงกัน',
  'Drag from the start to the end of the gradient': 'ลากจากจุดเริ่มถึงจุดสิ้นสุดของไล่สี',
  'Drag the area to keep, then Apply': 'ลากพื้นที่ที่จะเก็บไว้ แล้วกดใช้งาน',
  'Foreground colour': 'สีหน้า',
  'Background colour': 'สีพื้นหลัง',
  'Swap colours (X)': 'สลับสี (X)',
  'Black and white (D)': 'ขาวดำ (D)',
  held: 'ชั่วคราว',
  // options
  Size: 'ขนาด',
  Hardness: 'ความแข็ง',
  Opacity: 'ความทึบ',
  Flow: 'การไหล',
  Tolerance: 'ค่าความคลาดเคลื่อน',
  'Connected only': 'เฉพาะที่ติดกัน',
  Mode: 'โหมด',
  Replace: 'แทนที่',
  Add: 'เพิ่ม',
  Subtract: 'ลบออก',
  Intersect: 'ตัดกัน',
  Feather: 'ขอบนุ่ม',
  Style: 'รูปแบบ',
  Linear: 'เส้นตรง',
  Radial: 'วงกลม',
  Angle: 'มุม',
  Reflected: 'สะท้อน',
  Diamond: 'ข้าวหลามตัด',
  'Apply crop': 'ใช้การครอป',
  Cancel: 'ยกเลิก',
  'Select all': 'เลือกทั้งหมด',
  Deselect: 'ไม่เลือก',
  Invert: 'กลับสี',
  'Invert selection': 'กลับด้านการเลือก',
  'Histogram': 'ฮิสโตแกรม',
  // zoom / status
  'Fit on screen (Ctrl+0)': 'พอดีหน้าจอ (Ctrl+0)',
  'Zoom out (Ctrl+-)': 'ย่อ (Ctrl+-)',
  'Zoom in (Ctrl+=)': 'ขยาย (Ctrl+=)',
  'Actual pixels (Ctrl+1)': 'พิกเซลจริง (Ctrl+1)',
  'No document open': 'ยังไม่ได้เปิดเอกสาร',
  // welcome
  'Edit photos, paint and compose — free and open source.': 'แต่งภาพ วาด และจัดองค์ประกอบ — ฟรีและโอเพนซอร์ส',
  'Open an image': 'เปิดรูปภาพ',
  'Custom size…': 'กำหนดขนาดเอง…',
  'Start blank': 'เริ่มจากผืนผ้าใบเปล่า',
  Square: 'จัตุรัส',
  'Full HD': 'Full HD',
  Story: 'สตอรี่',
  '4K': '4K',
  'A4 print': 'พิมพ์ A4',
  'Photo 3:2': 'ภาพถ่าย 3:2',
  'Social post': 'โพสต์โซเชียล',
  'Screen, 16:9': 'หน้าจอ 16:9',
  'Phone, 9:16': 'โทรศัพท์ 9:16',
  'UHD screen': 'จอ UHD',
  '300 ppi': '300 ppi',
  '24 MP': '24 ล้านพิกเซล',
  'Or drop a PNG, JPEG, WebP, TIFF, PSD or camera raw file anywhere.': 'หรือลากไฟล์ PNG, JPEG, WebP, TIFF, PSD หรือไฟล์ RAW จากกล้องมาวางตรงไหนก็ได้',
  // dialogs
  'New document': 'เอกสารใหม่',
  Name: 'ชื่อ',
  'Width (px)': 'ความกว้าง (px)',
  'Height (px)': 'ความสูง (px)',
  'Resolution (ppi)': 'ความละเอียด (ppi)',
  Background: 'พื้นหลัง',
  White: 'ขาว',
  Black: 'ดำ',
  Transparent: 'โปร่งใส',
  Create: 'สร้าง',
  'Width and height must be between 1 and 300,000 pixels.': 'ความกว้างและความสูงต้องอยู่ระหว่าง 1 ถึง 300,000 พิกเซล',
  'Find an action — try “blur”, “rotate”, “new layer”': 'ค้นหาคำสั่ง — ลองพิมพ์ “blur”, “rotate”, “new layer”',
  'No matching action': 'ไม่พบคำสั่งที่ตรงกัน',
  'actions from the engine · ↑↓ to move · Enter to run': 'คำสั่งจากเอนจิน · ↑↓ เพื่อเลื่อน · Enter เพื่อรัน',
  done: 'เสร็จแล้ว',
  'is not available right now': 'ใช้งานไม่ได้ในตอนนี้',
  Opened: 'เปิดแล้ว',
  Exported: 'ส่งออกแล้ว',
  // inspector
  Layers: 'เลเยอร์',
  Adjust: 'ปรับแต่ง',
  Image: 'ภาพ',
  History: 'ประวัติ',
  'Open or create a document to see its layers, adjustments and history.': 'เปิดหรือสร้างเอกสารเพื่อดูเลเยอร์ การปรับแต่ง และประวัติ',
  Blend: 'การผสม',
  'New layer': 'เลเยอร์ใหม่',
  'Duplicate layer': 'ทำสำเนาเลเยอร์',
  'Merge down': 'รวมลงด้านล่าง',
  'Delete layer': 'ลบเลเยอร์',
  Hide: 'ซ่อน',
  Show: 'แสดง',
  'Layer name': 'ชื่อเลเยอร์',
  'layer — double-click the name to rename': 'เลเยอร์ — ดับเบิลคลิกที่ชื่อเพื่อเปลี่ยนชื่อ',
  'One click': 'คลิกเดียว',
  'Fine tune': 'ปรับละเอียด',
  'Auto tone': 'โทนอัตโนมัติ',
  'Auto contrast': 'คอนทราสต์อัตโนมัติ',
  'Auto colour': 'สีอัตโนมัติ',
  'Black & white': 'ขาวดำ',
  Light: 'แสง',
  'Brightness and contrast': 'ความสว่างและคอนทราสต์',
  Brightness: 'ความสว่าง',
  Contrast: 'คอนทราสต์',
  Exposure: 'การรับแสง',
  'Stops of light': 'จำนวนสต็อปของแสง',
  Gamma: 'แกมมา',
  Colour: 'สี',
  'Hue, saturation and lightness': 'เฉดสี ความอิ่มสี และความสว่าง',
  Hue: 'เฉดสี',
  Saturation: 'ความอิ่มสี',
  Lightness: 'ความสว่างสี',
  Vibrance: 'ความสดสี',
  'Gentle saturation that protects skin tones': 'เพิ่มความอิ่มสีอย่างนุ่มนวล ปกป้องสีผิว',
  Soften: 'ทำให้นุ่ม',
  'Gaussian blur': 'เบลอแบบเกาส์เซียน',
  Radius: 'รัศมี',
  Sharpen: 'ทำให้คมชัด',
  'Mosaic': 'โมเสก',
  'Flat blocks of colour': 'ก้อนสีเรียบเป็นช่อง',
  'Cell size': 'ขนาดช่อง',
  'Emboss': 'นูนต่ำ',
  'Grey relief': 'ภาพนูนสีเทา',
  'Height': 'ความสูง',
  'High pass': 'ไฮพาส',
  'Keep only fine detail': 'เก็บเฉพาะรายละเอียดละเอียด',
  'Color': 'สี',
  'Swatches': 'แถบสี',
  'Properties': 'คุณสมบัติ',
  'Adjustments': 'การปรับแต่ง',
  'No properties': 'ไม่มีคุณสมบัติ',
  'No document': 'ไม่มีเอกสาร',
  'Collapse': 'ย่อแผง',
  'Hex colour': 'รหัสสี hex',
  'Pick a hue': 'เลือกเฉดสี',
  'Pick a shade': 'เลือกความเข้มของสี',
  'click: foreground · Alt+click: background': 'คลิก: สีหน้า · Alt+คลิก: สีพื้นหลัง',
  'Zoom — type a percentage and press Enter': 'ซูม — พิมพ์เปอร์เซ็นต์แล้วกด Enter',
  'Nothing here yet': 'ยังไม่มีรายการ',
  'File': 'ไฟล์',
  'Layer': 'เลเยอร์',
  'Type': 'ข้อความ',
  'Select': 'เลือก',
  'Filter': 'ฟิลเตอร์',
  'View': 'มุมมอง',
  'Window': 'หน้าต่าง',
  'Help': 'ช่วยเหลือ',
  'About PhotoDesign': 'เกี่ยวกับ PhotoDesign',
  'PhotoDesign — free and open source photo editor. Engine in Rust, interface in TypeScript.': 'PhotoDesign — โปรแกรมแต่งภาพฟรีและโอเพนซอร์ส engine เขียนด้วย Rust หน้าตาเขียนด้วย TypeScript',
  'Unsharp mask': 'Unsharp mask',
  Amount: 'ปริมาณ',
  'Apply to layer': 'ใช้กับเลเยอร์',
  'Changes apply to the selected layer and can be undone.': 'การเปลี่ยนแปลงใช้กับเลเยอร์ที่เลือก และเลิกทำได้',
  Undo: 'เลิกทำ',
  Redo: 'ทำซ้ำ',
  Transform: 'แปลงรูป',
  'Rotate left': 'หมุนซ้าย',
  'Rotate right': 'หมุนขวา',
  'Rotate 180°': 'หมุน 180°',
  'Flip horizontal': 'พลิกแนวนอน',
  'Flip vertical': 'พลิกแนวตั้ง',
  'Image size': 'ขนาดภาพ',
  'Canvas size': 'ขนาดผืนผ้าใบ',
  'Resize image': 'ปรับขนาดภาพ',
  Percent: 'เปอร์เซ็นต์',
  Resize: 'ปรับขนาด',
  Selection: 'การเลือก',
  'Grow selection': 'ขยายการเลือก',
  'Shrink selection': 'หดการเลือก',
  'Soften edge': 'ทำขอบนุ่ม',
  'Fill selection': 'เทสีในพื้นที่เลือก',
  'Clear selection contents': 'ลบเนื้อหาในพื้นที่เลือก',
  'Nothing is selected': 'ยังไม่ได้เลือกพื้นที่',
  Edit: 'แก้ไข',
  // status
  ppi: 'ppi',
  // errors
  'PhotoDesign could not start': 'PhotoDesign เริ่มทำงานไม่ได้',
  'Build the engine first: npm run engine': 'ต้องสร้างเอนจินก่อน: npm run engine',
  'Starting PhotoDesign…': 'กำลังเริ่ม PhotoDesign…',
};

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORE_KEY, lang);
  } catch {
    // private mode or no storage: the choice lasts for this session
  }
  document.documentElement.lang = lang;
  for (const fn of listeners) fn();
}

/** The saved language, or the browser's when it is Thai. Call once at start. */
export function initLang(): Lang {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORE_KEY);
  } catch {
    saved = null;
  }
  const guess = typeof navigator !== 'undefined' && /^th\b/i.test(navigator.language) ? 'th' : 'en';
  current = saved === 'th' || saved === 'en' ? saved : guess;
  document.documentElement.lang = current;
  return current;
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate an English UI string. */
export function t(text: string): string {
  return current === 'th' ? (TH[text] ?? text) : text;
}
