'use client';

import type React from 'react';
import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Grid, FileText, Download, PlusCircle, Trash2, ArrowLeft, ArrowRight, ImagePlus } from 'lucide-react';
import jsPDF from 'jspdf';
// Import a font that supports a wide range of UTF-8 characters.
// jsPDF includes some basic fonts, but for broader UTF-8 support,
// you might need to embed a custom font. For simplicity, we'll try
// using a standard font known for better support, like 'Helvetica' or 'Arial'.
// If specific characters still don't render, embedding a font like NotoSans
// would be necessary.
// import { NotoSans_Regular } from './path/to/notosans-regular-normal.js'; // Example path

import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator'; // Ensure Separator is imported

interface ImageItem {
  id: string;
  src: string;
  label: string;
}

interface Page {
  id: string;
  items: (ImageItem | null)[]; // Array representing grid cells, null for empty
  rows: number;
  cols: number;
}

const MAX_IMAGES_PER_PAGE = 12; // Example limit, adjust as needed
const DEFAULT_ROWS = 3;
const DEFAULT_COLS = 4;

export default function Home() {
  const [pages, setPages] = useState<Page[]>([{ id: crypto.randomUUID(), items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null), rows: DEFAULT_ROWS, cols: DEFAULT_COLS }]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleUploadIndexRef = useRef<number | null>(null); // Ref to store target index for single upload
  const { toast } = useToast();

  const currentPage = pages[currentPageIndex];

  const triggerFileUpload = (targetIndex: number | null = null) => {
      singleUploadIndexRef.current = targetIndex; // Store the target index if provided
      fileInputRef.current?.click();
  };


  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const targetIndex = singleUploadIndexRef.current; // Get the target index for single upload
    singleUploadIndexRef.current = null; // Reset the ref

    let filesToProcess: File[] = Array.from(files);

    // If uploading to a specific slot, only take the first file
    if (targetIndex !== null) {
      filesToProcess = [files[0]];
    }

    let pageIdx = currentPageIndex;
    let itemIdx = targetIndex ?? currentPage.items.findIndex(item => item === null); // Use targetIndex or find first empty


     // If targetIndex is specified but already filled, show error (shouldn't happen with current UI flow but good practice)
     if (targetIndex !== null && pages[pageIdx]?.items[targetIndex] !== null) {
        toast({
          title: "Upload Failed",
          description: "The selected slot is already filled.",
          variant: "destructive",
        });
         if (fileInputRef.current) fileInputRef.current.value = ''; // Reset file input
        return;
     }

     // If no empty slot found (and not targeting a specific slot)
     if (itemIdx === -1 && targetIndex === null) {
       let foundSpace = false;
       for (let i = 0; i < pages.length; i++) {
         const page = pages[i];
         const firstEmpty = page.items.findIndex(item => item === null);
         if (firstEmpty !== -1) {
           pageIdx = i;
           itemIdx = firstEmpty;
           foundSpace = true;
           break;
         }
       }
       if (!foundSpace) {
         addPage(); // Add a new page
         pageIdx = pages.length; // This will be the index *before* state updates, so length is correct
         itemIdx = 0;
         // Need to handle the newly added page reference correctly after state update potential async issues.
         // A safer approach might involve updating state first, then processing files.
         // For now, we proceed assuming addPage updates pages array immediately (which it does via setPages).
         // The actual update happens after file reading, so we need to be careful.
         // Let's directly modify the newPages array that will be set later.
       }
     }


    const newPages = JSON.parse(JSON.stringify(pages)); // Deep copy to avoid mutation issues

    let currentFileIndex = 0;
    let filesAddedCount = 0;

     const readFile = (file: File, targetPIdx: number, targetIIdx: number) => {
       const reader = new FileReader();
       reader.onload = (e) => {
         if (e.target?.result) {
            // Ensure the target slot exists and is empty before adding
           if (newPages[targetPIdx] && newPages[targetPIdx].items[targetIIdx] === null) {
               const newItem: ImageItem = {
                 id: crypto.randomUUID(),
                 src: e.target.result as string,
                 label: '',
               };
               newPages[targetPIdx].items[targetIIdx] = newItem;
               filesAddedCount++;
           } else {
                // This case handles if the target slot got filled unexpectedly or page structure changed.
                // Attempt to find the *next* absolutely available slot across all pages.
               let nextAbsPIdx = -1, nextAbsIIdx = -1;
               for(let p = 0; p < newPages.length; p++) {
                   const emptyIdx = newPages[p].items.findIndex((item: ImageItem | null) => item === null);
                   if (emptyIdx !== -1) {
                       nextAbsPIdx = p;
                       nextAbsIIdx = emptyIdx;
                       break;
                   }
               }

               if (nextAbsPIdx !== -1) {
                    const newItem: ImageItem = {
                        id: crypto.randomUUID(),
                        src: e.target.result as string,
                        label: '',
                    };
                   newPages[nextAbsPIdx].items[nextAbsIIdx] = newItem;
                   filesAddedCount++;
                   console.warn(`Original target slot [${targetPIdx}, ${targetIIdx}] was filled. Image placed in next available slot [${nextAbsPIdx}, ${nextAbsIIdx}].`);
               } else {
                   // If truly no space left anywhere (even after potential page add), then warn.
                   console.warn("No available slots found for an uploaded image. It might have been discarded.");
               }
           }

           // If this is the last file read, update the state
           if (currentFileIndex === filesToProcess.length) {
                setPages(newPages);
                 toast({
                  title: "Upload Successful",
                  description: `${filesAddedCount} image(s) added.`,
                 });
           }
         }
         // Process next file after this one loads (or fails)
         currentFileIndex++;
         if (currentFileIndex < filesToProcess.length) {
            processNextFile();
         }
       };
        reader.onerror = () => {
            console.error("Error reading file:", file.name);
            toast({ title: "File Read Error", description: `Could not read file ${file.name}.`, variant: "destructive" });
            // Process next file even if one fails
            currentFileIndex++;
            if (currentFileIndex < filesToProcess.length) {
                 processNextFile();
             } else {
                 // If this was the last file and it failed, still update state with previous successes
                 setPages(newPages);
                  toast({
                     title: "Upload Partially Successful",
                     description: `${filesAddedCount} image(s) added. Some files failed.`,
                     variant: filesAddedCount > 0 ? "default" : "destructive",
                 });
             }
        };
       reader.readAsDataURL(file);
     };

      const processNextFile = () => {
         const file = filesToProcess[currentFileIndex];
         // Find the next available slot *starting from the last known good slot*
         // This handles multi-file uploads filling subsequent slots correctly.

         let currentTargetPIdx = pageIdx;
         let currentTargetIIdx = itemIdx;

         // If we are in single-upload mode, we already have the target index.
         if (targetIndex !== null && currentFileIndex === 0) {
             // Use the initial targetIndex for the first (and only) file
             currentTargetIIdx = targetIndex;
         } else {
              // For multi-upload or if the initial slot was invalid, find the next empty one
              let foundNextSlot = false;
              for (let p = currentTargetPIdx; p < newPages.length; p++) {
                  // Start searching from currentItemIndex + 1 if on the same page, else from 0 on subsequent pages
                  const startIdx = (p === currentTargetPIdx) ? (currentTargetIIdx + 1) : 0;
                  const nextEmptyIdx = newPages[p].items.findIndex((item: ImageItem | null, idx: number) => item === null && idx >= startIdx);
                  if (nextEmptyIdx !== -1) {
                      currentTargetPIdx = p;
                      currentTargetIIdx = nextEmptyIdx;
                      foundNextSlot = true;
                      break;
                  }
              }

               // If no slot found in existing pages, try adding a page (if not in single upload mode)
               if (!foundNextSlot && targetIndex === null) {
                    const newPage: Page = { id: crypto.randomUUID(), items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null), rows: DEFAULT_ROWS, cols: DEFAULT_COLS };
                    newPages.push(newPage); // Add page directly to the array we will set later
                    currentTargetPIdx = newPages.length - 1;
                    currentTargetIIdx = 0;
                    foundNextSlot = true; // A slot is now available on the new page
                    console.log("Added new page during multi-file upload.");
               }

               if (!foundNextSlot) {
                   // Should not happen if page addition works, but as a fallback:
                   console.error("Could not find an empty slot for file:", file.name);
                    toast({ title: "Upload Warning", description: `No space for file ${file.name}.`, variant: "destructive" });
                   // Skip to the next file without reading this one
                   currentFileIndex++;
                   if (currentFileIndex < filesToProcess.length) {
                       processNextFile();
                   } else if(filesAddedCount > 0) {
                        // If this was the last file and couldn't find space, update state with previous successes.
                        setPages(newPages);
                        toast({ title: "Upload Complete", description: `${filesAddedCount} image(s) added. Some files could not be placed.`, variant: "default" });
                   }
                   return; // Stop processing this file
               }
         }

          // Update pageIdx and itemIdx for the *next* iteration's search start point
          pageIdx = currentTargetPIdx;
          itemIdx = currentTargetIIdx;

          readFile(file, currentTargetPIdx, currentTargetIIdx);
      };

     // Start processing the first file
     if (filesToProcess.length > 0) {
       processNextFile();
     }


    // Reset file input value to allow uploading the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  const handleLabelChange = (imageId: string, newLabel: string) => {
    setPages(prevPages => prevPages.map((page, pIndex) => {
      if (pIndex === currentPageIndex) {
        return {
          ...page,
          items: page.items.map(item =>
            item?.id === imageId ? { ...item, label: newLabel } : item
          ),
        };
      }
      return page;
    }));
  };

 const handleGridChange = (dimension: 'rows' | 'cols', value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 1) return; // Basic validation

    setPages(prevPages => prevPages.map((page, pIndex) => {
      if (pIndex === currentPageIndex) {
        const newRows = dimension === 'rows' ? numValue : page.rows;
        const newCols = dimension === 'cols' ? numValue : page.cols;
        const newSize = newRows * newCols;
        const currentItems = page.items.filter(item => item !== null) as ImageItem[];
        const newItems: (ImageItem | null)[] = Array(newSize).fill(null);

        // Distribute existing items into the new grid size
        for (let i = 0; i < Math.min(currentItems.length, newSize); i++) {
          newItems[i] = currentItems[i];
        }

        return { ...page, rows: newRows, cols: newCols, items: newItems };
      }
      return page;
    }));
  };


 const handleDeleteImage = (imageId: string) => {
    setPages(prevPages => prevPages.map((page, pIndex) => {
      if (pIndex === currentPageIndex) {
        return {
          ...page,
          items: page.items.map(item =>
            item?.id === imageId ? null : item
          ),
        };
      }
      return page;
    }));
     toast({
      title: "Image Removed",
      description: "The image has been removed from the grid.",
      variant: "destructive"
     });
  };

 const addPage = () => {
    setPages(prevPages => {
         const newPage: Page = {
           id: crypto.randomUUID(),
           items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null),
           rows: DEFAULT_ROWS,
           cols: DEFAULT_COLS,
         };
         const updatedPages = [...prevPages, newPage];
         setCurrentPageIndex(updatedPages.length - 1); // Switch to the new page
          toast({
           title: "Page Added",
           description: `Page ${updatedPages.length} has been created.`,
          });
         return updatedPages;
     });
  };

 const deletePage = (pageIndex: number) => {
     if (pages.length <= 1) {
         toast({
             title: "Cannot Delete",
             description: "You must have at least one page.",
             variant: "destructive",
         });
         return;
     }
     const deletedPageNum = pageIndex + 1;
     setPages(prevPages => prevPages.filter((_, index) => index !== pageIndex));
     // Adjust current page index if necessary
     if (currentPageIndex >= pageIndex && currentPageIndex > 0) {
         setCurrentPageIndex(prevIndex => prevIndex - 1);
     } else if (currentPageIndex === pageIndex && pages.length > 1) {
        // If the deleted page was the current one and others remain, go to the first page.
        // Note: pages.length already reflects the deletion in the context of this state update.
        setCurrentPageIndex(0);
     } else if (pages.length === 1) {
        // If deleting the second-to-last page, the index should become 0.
        setCurrentPageIndex(0);
     }

     toast({
      title: "Page Deleted",
      description: `Page ${deletedPageNum} has been deleted.`,
      variant: "destructive",
     });
  };


  const goToNextPage = () => {
    if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(prevIndex => prevIndex + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(prevIndex => prevIndex - 1);
    }
  };

 const exportToPDF = useCallback(async () => {
    toast({ title: 'Generating PDF...', description: 'Please wait.' });
    const pdf = new jsPDF({
        orientation: 'p', // Portrait orientation
        unit: 'pt',      // Points as unit
        format: 'a4'     // A4 paper size
    });

    // --- UTF-8 Font Handling ---
    // 1. Try a standard font with broader support.
    // pdf.setFont('Helvetica', 'normal'); // Or 'Arial'

    // 2. (Recommended for full support) Embed a custom UTF-8 font if needed.
    //    You'd typically load the font definition (often a Base64 string)
    //    and add it to jsPDF. This requires the font file in your project.
    try {
      // Example: Adding Noto Sans (requires the font file and definition)
      // pdf.addFileToVFS('NotoSans-Regular-normal.ttf', NotoSans_Regular); // Add font file to virtual file system
      // pdf.addFont('NotoSans-Regular-normal.ttf', 'NotoSans', 'normal'); // Register the font
      // pdf.setFont('NotoSans'); // Set the active font
        // Using built-in Helvetica as a fallback with potential UTF-8 issues for some chars
        pdf.setFont('Helvetica');
    } catch (fontError) {
        console.error("Error setting PDF font, using default:", fontError);
        toast({ title: 'Font Warning', description: 'Could not load custom font, some characters might not render correctly.', variant: 'destructive' });
        // jsPDF will use a default font if setFont fails or isn't called
    }
    // --- End UTF-8 Font Handling ---


    const pageMargin = 40; // Margin in points
    const pageWidth = pdf.internal.pageSize.getWidth() - 2 * pageMargin;
    const pageHeight = pdf.internal.pageSize.getHeight() - 2 * pageMargin;
    const labelHeight = 25; // Increased height for labels, especially multiline
    const labelFontSize = 10; // Font size for labels

    pdf.setFontSize(labelFontSize); // Set font size for labels early

    try {
        for (let p = 0; p < pages.length; p++) {
            const pageData = pages[p];
            const { rows, cols, items } = pageData;
            const totalItemsOnPage = items.filter(item => item !== null).length;

             if (p > 0) pdf.addPage(); // Add new page for subsequent pages

             if (totalItemsOnPage === 0) {
                pdf.setFontSize(12); // Reset font size for page status text
                pdf.text(`Page ${p + 1} (empty)`, pageMargin, pageMargin + 12);
                pdf.setFontSize(labelFontSize); // Set back for potential grid lines/labels on next pages
                continue; // Skip image processing for empty pages
            }


            const cellWidth = pageWidth / cols;
            // Calculate available height for image per cell
            const availableImageHeight = (pageHeight / rows) - labelHeight;
            if (availableImageHeight <= 0) {
                console.error(`Calculated negative/zero image height on page ${p+1}. Check rows/labelHeight.`);
                 toast({ title: 'Layout Error', description: `Cannot render page ${p+1} due to layout issue.`, variant: 'destructive' });
                continue; // Skip this page
            }

            const imgMaxWidth = cellWidth * 0.95; // Max width of image within cell (little padding)
            const imgMaxHeight = availableImageHeight * 0.95; // Max height of image within cell

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item) continue;

                const rowIndex = Math.floor(i / cols);
                const colIndex = i % cols;

                // Calculate top-left corner of the cell's drawing area
                const cellX = pageMargin + colIndex * cellWidth;
                const cellY = pageMargin + rowIndex * (availableImageHeight + labelHeight);

                 try {
                    // Use Promise to ensure image is loaded before adding to PDF
                    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                        const image = new Image();
                        image.onload = () => resolve(image);
                        image.onerror = (err) => reject(err);
                        image.src = item.src;
                    });

                    const imgWidth = img.naturalWidth;
                    const imgHeight = img.naturalHeight;
                    const aspectRatio = imgWidth / imgHeight;

                    let drawWidth = imgMaxWidth;
                    let drawHeight = drawWidth / aspectRatio;

                    if (drawHeight > imgMaxHeight) {
                        drawHeight = imgMaxHeight;
                        drawWidth = drawHeight * aspectRatio;
                    }

                    // Center the image within its allocated image area within the cell
                    const drawX = cellX + (cellWidth - drawWidth) / 2;
                    const drawY = cellY + (availableImageHeight - drawHeight) / 2;

                    // Determine image type (simple check, might need improvement)
                    const imageType = item.src.startsWith('data:image/png') ? 'PNG' : 'JPEG';
                    pdf.addImage(item.src, imageType, drawX, drawY, drawWidth, drawHeight);

                     // Add label below the image's allocated area
                     if (item.label) {
                         const labelX = cellX + (cellWidth / 2); // Center label text horizontally
                         const labelY = cellY + availableImageHeight + 10; // Position label below image area + padding
                         // Use splitTextToSize for multi-line labels and correct UTF-8 handling
                         const labelLines = pdf.splitTextToSize(item.label, cellWidth * 0.9); // Wrap text within cell width
                         pdf.text(labelLines, labelX, labelY, { align: 'center', maxWidth: cellWidth * 0.9 });
                     }

                 } catch (imgError) {
                     console.error(`Error loading or adding image ${item.id} to PDF:`, imgError);
                     // Draw a placeholder or error message in the PDF cell
                      const errorX = cellX + 5;
                      const errorY = cellY + 20;
                     pdf.text('Error loading image', errorX, errorY);
                 }
            }
            // Optional: Draw grid lines (after drawing all images/labels on the page)
            // pdf.setDrawColor(200, 200, 200); // Light gray lines
            // for (let r = 0; r <= rows; r++) {
            //     const lineY = pageMargin + r * (availableImageHeight + labelHeight);
            //     pdf.line(pageMargin, lineY, pageWidth + pageMargin, lineY);
            // }
            // for (let c = 0; c <= cols; c++) {
            //     const lineX = pageMargin + c * cellWidth;
            //     pdf.line(lineX, pageMargin, lineX, pageHeight + pageMargin);
            // }
            // pdf.setDrawColor(0, 0, 0); // Reset draw color
        }

        pdf.save('gridify_export.pdf');
        toast({ title: 'PDF Generated!', description: 'Your PDF has been downloaded.' });
    } catch (error) {
        console.error('Error generating PDF:', error);
        toast({ title: 'PDF Generation Failed', description: 'An error occurred while generating the PDF.', variant: 'destructive' });
    }
}, [pages, toast]);


  return (
    <div className="container mx-auto p-4 flex flex-col min-h-screen bg-background">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-center text-foreground">Gridify</h1>
        <p className="text-center text-muted-foreground">Arrange images in grids and export as PDF</p>
      </header>

      <div className="flex flex-col md:flex-row gap-6 flex-grow">
        {/* Controls Panel */}
        <Card className="w-full md:w-1/4 h-fit sticky top-4 shadow-md">
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="image-upload-button" className="mb-2 block">Upload Images</Label>
              {/* Button to trigger generic upload */}
              <Button id="image-upload-button" onClick={() => triggerFileUpload()} className="w-full" variant="outline">
                <Upload className="mr-2 h-4 w-4" /> Choose Images
              </Button>
              {/* Hidden file input */}
              <Input
                id="file-input" // Changed ID to avoid conflict if Label used 'for'
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                multiple
                accept="image/*"
                className="hidden"
                // Consider adding capture attribute for mobile camera access: capture="environment" or capture="user"
              />
            </div>
            <Separator />
             <div>
               <Label className="mb-2 block">Grid Layout (Page {currentPageIndex + 1})</Label>
               <div className="flex gap-2">
                 <Select onValueChange={(value) => handleGridChange('rows', value)} value={String(currentPage?.rows ?? DEFAULT_ROWS)}>
                   <SelectTrigger className="w-full">
                     <SelectValue placeholder="Rows" />
                   </SelectTrigger>
                   <SelectContent>
                     {[1, 2, 3, 4, 5, 6].map(n => <SelectItem key={`row-${n}`} value={String(n)}>{n} Rows</SelectItem>)}
                   </SelectContent>
                 </Select>
                 <Select onValueChange={(value) => handleGridChange('cols', value)} value={String(currentPage?.cols ?? DEFAULT_COLS)}>
                   <SelectTrigger className="w-full">
                     <SelectValue placeholder="Cols" />
                   </SelectTrigger>
                   <SelectContent>
                     {[1, 2, 3, 4, 5, 6].map(n => <SelectItem key={`col-${n}`} value={String(n)}>{n} Cols</SelectItem>)}
                   </SelectContent>
                 </Select>
               </div>
             </div>
              <Separator />
              <div className="flex gap-2">
                 <Button onClick={addPage} className="w-full" variant="outline">
                   <PlusCircle className="mr-2 h-4 w-4" /> Add Page
                 </Button>
                  <Button onClick={() => deletePage(currentPageIndex)} className="w-full" variant="destructive" disabled={pages.length <= 1}>
                   <Trash2 className="mr-2 h-4 w-4" /> Delete Page
                 </Button>
              </div>
              <Separator />
             <Button onClick={exportToPDF} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
               <Download className="mr-2 h-4 w-4" /> Export as PDF
             </Button>
          </CardContent>
        </Card>

        {/* Grid Display Area */}
        <main className="flex-grow flex flex-col">
          <Card className="flex-grow shadow-md">
            <CardHeader className="flex flex-row justify-between items-center border-b pb-4">
              <CardTitle>Page {currentPageIndex + 1} of {pages.length}</CardTitle>
              <div className="flex gap-2">
                 <Button onClick={goToPrevPage} disabled={currentPageIndex === 0} size="icon" variant="outline">
                     <ArrowLeft className="h-4 w-4"/>
                     <span className="sr-only">Previous Page</span>
                 </Button>
                 <Button onClick={goToNextPage} disabled={currentPageIndex === pages.length - 1} size="icon" variant="outline">
                     <ArrowRight className="h-4 w-4"/>
                      <span className="sr-only">Next Page</span>
                 </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {currentPage ? (
                <div
                    className={`grid gap-4 border border-dashed border-border p-4 rounded-md bg-muted/10`}
                    style={{
                    gridTemplateColumns: `repeat(${currentPage.cols}, minmax(0, 1fr))`, // Use minmax for better flex distribution
                    gridTemplateRows: `repeat(${currentPage.rows}, minmax(150px, auto))`, // Ensure minimum row height, allow expansion
                    }}
                >
                    {currentPage.items.map((item, index) => (
                    <div
                        key={item?.id ?? `empty-${index}`}
                        className="border rounded-md flex flex-col items-center justify-between p-2 relative group bg-card hover:shadow-lg transition-shadow aspect-w-1 aspect-h-1" // Maintain aspect ratio, adjust justify content
                    >
                        {item ? (
                        <>
                            <div className="flex-grow flex items-center justify-center w-full h-[70%] mb-1 overflow-hidden">
                                <img
                                    src={item.src}
                                    alt={`Uploaded ${index + 1}`}
                                    className="max-w-full max-h-full object-contain rounded" // Use object-contain
                                />
                            </div>
                            <Textarea
                            value={item.label}
                            onChange={(e) => handleLabelChange(item.id, e.target.value)}
                            placeholder="Add label..."
                            className="w-full text-xs h-10 mt-auto resize-none p-1 text-foreground bg-background border-input focus:ring-ring" // Adjusted styling
                            rows={2} // Allow for slightly more text
                            />
                            <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded-full p-1" // Ensure padding works with icon size
                            onClick={() => handleDeleteImage(item.id)}
                            aria-label="Delete image"
                            >
                            <Trash2 className="h-3 w-3" />
                            </Button>
                        </>
                        ) : (
                        <button
                            className="w-full h-full flex flex-col items-center justify-center text-center text-muted-foreground hover:bg-accent/10 transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                            onClick={() => triggerFileUpload(index)} // Pass the index to target this specific slot
                            aria-label={`Add image to slot ${index + 1}`}
                        >
                            <ImagePlus className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50"/>
                            <span className="text-sm">Click to add image</span>
                        </button>
                        )}
                    </div>
                    ))}
                </div>
              ) : (
                 <div className="text-center text-muted-foreground p-10">Loading page data...</div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
       <footer className="text-center mt-8 mb-4 text-sm text-muted-foreground">
            Built with Next.js, ShadCN UI, and jsPDF.
        </footer>
    </div>
  );
}

// Separator component is already imported from '@/components/ui/separator'
// const Separator = () => <hr className="my-4 border-border" />; // Removed duplicate
