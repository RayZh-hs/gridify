// --- Placeholder for Noto Sans Regular Font VFS Data ---
//
// This file is a placeholder. To enable full UTF-8 character support in PDFs,
// you need to generate the actual jsPDF Virtual File System (VFS) data for
// the Noto Sans Regular font and replace the content of this file with it.
//
// Instructions:
// 1. Download the Noto Sans Regular font file (e.g., NotoSans-Regular.ttf).
//    You can find it on Google Fonts: https://fonts.google.com/noto/specimen/Noto+Sans
// 2. Use an online or offline tool to convert the .ttf file into a Base64 encoded
//    JavaScript file compatible with jsPDF's VFS. A common tool is fontconverter.js
//    (you might find versions online or need to set one up locally).
// 3. The output will be a JavaScript file containing something like:
//    export const NotoSans_Regular = 'AAEAAAARAQAABAAQRFNJR... (very long Base64 string)';
// 4. Replace the entire content of this placeholder file (`src/lib/fonts/NotoSans-Regular-normal.js`)
//    with the content generated in step 3.
// 5. Uncomment the import line in `src/app/page.tsx`:
//    // import { NotoSans_Regular } from '@/lib/fonts/NotoSans-Regular-normal.js';
// 6. Uncomment the VFS registration lines within the `exportToPDF` function in `src/app/page.tsx`:
//    // pdf.addFileToVFS('NotoSans-Regular-normal.ttf', NotoSans_Regular);
//    // pdf.addFont('NotoSans-Regular-normal.ttf', 'NotoSans', 'normal');
//    // pdf.setFont('NotoSans', 'normal');
// 7. You might need to comment out the fallback `pdf.setFont('Helvetica', 'normal');` lines after enabling NotoSans.
//
// After completing these steps, jsPDF should use Noto Sans for rendering text in the PDF,
// providing much better support for various UTF-8 characters.
//
// --- End Placeholder ---

// If you don't generate the font file, leave this export line here
// so the import in page.tsx doesn't cause a hard error, although the font won't load.
export const NotoSans_Regular = undefined;

