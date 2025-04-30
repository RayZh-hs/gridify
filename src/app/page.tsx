// @ts-nocheck
'use client';

import type React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Grid, FileText, Download, PlusCircle, Trash2, ArrowLeft, ArrowRight, ImagePlus, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
// Import a font that supports a wide range of UTF-8 characters.
// Noto Sans is a good choice for broad UTF-8 support.
// You need to download the font file (e.g., NotoSans-Regular.ttf)
// and generate the VFS (Virtual File System) compatible JS file for jsPDF.
// Tools like `fontconverter.js` can be used for this.
// Example: import { NotoSans_Regular } from './path/to/NotoSans-Regular-normal.js';
// For simplicity, we'll stick with Helvetica for now, accepting potential limitations.

import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

interface ImageItem {
  id: string;
  src: string; // Data URI
  label: string;
  fileType: string; // e.g., 'image/jpeg', 'image/png'
}

interface Page {
  id: string;
  items: (ImageItem | null)[];
  rows: number;
  cols: number;
}

const DEFAULT_ROWS = 3;
const DEFAULT_COLS = 4;

export default function Home() {
  const [pages, setPages] = useState<Page[]>([{ id: crypto.randomUUID(), items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null), rows: DEFAULT_ROWS, cols: DEFAULT_COLS }]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoadingPDF, setIsLoadingPDF] = useState(false);
  const { toast } = useToast();

  const currentPage = pages[currentPageIndex];

  // Ref to track the index for direct slot upload
  const directUploadIndexRef = useRef<number | null>(null);

  // Function to trigger file input click
  const triggerFileUpload = (targetIndex: number | null = null) => {
    console.log(`Triggering upload. Target index: ${targetIndex}`);
    directUploadIndexRef.current = targetIndex; // Store target index if provided
    // Reset input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  // Reads a single file and returns a Promise with the ImageItem data or null on error
  const readFileAsDataURL = (file: File): Promise<Omit<ImageItem, 'id' | 'label'> | null> => {
      return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
              if (e.target?.result) {
                  resolve({
                      src: e.target.result as string,
                      fileType: file.type,
                  });
              } else {
                  console.error("Error reading file:", file.name, " - Event target result is null");
                  toast({ title: "File Read Error", description: `Could not read file ${file.name}.`, variant: "destructive" });
                  resolve(null); // Resolve with null on error
              }
          };
          reader.onerror = (error) => {
              console.error("Error reading file:", file.name, error);
              toast({ title: "File Read Error", description: `Could not read file ${file.name}.`, variant: "destructive" });
              resolve(null); // Resolve with null on error
          };
          reader.readAsDataURL(file);
      });
  };

  // Handles the actual file selection event
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) {
          console.log("No files selected.");
          directUploadIndexRef.current = null; // Reset ref
          return;
      }

      const targetIndex = directUploadIndexRef.current;
      directUploadIndexRef.current = null; // Reset ref immediately after use

      console.log(`Files selected: ${files.length}, Target index: ${targetIndex}`);

      let filesToProcess: File[] = Array.from(files);

      // --- Prepare state update ---
      // Use a functional update to ensure we work with the latest state
      setPages(currentPages => {
          let newPages = JSON.parse(JSON.stringify(currentPages)); // Deep copy
          let filesAddedCount = 0;
          let slotsToFill: { pageIndex: number; itemIndex: number }[] = [];

          // --- Determine target slots ---
          if (targetIndex !== null) {
              // Direct slot upload: Only use the first file and the specific slot
              if (filesToProcess.length > 1) {
                  toast({ title: "Notice", description: "Only the first selected image will be added to the specific slot.", variant: "default" });
              }
              filesToProcess = [filesToProcess[0]]; // Take only the first file

              if (currentPageIndex < newPages.length && targetIndex < newPages[currentPageIndex].items.length) {
                  if (newPages[currentPageIndex].items[targetIndex] === null) {
                      slotsToFill.push({ pageIndex: currentPageIndex, itemIndex: targetIndex });
                      console.log(`Targeting specific slot: Page ${currentPageIndex}, Index ${targetIndex}`);
                  } else {
                      toast({ title: "Upload Failed", description: "The selected slot is already filled.", variant: "destructive" });
                      return currentPages; // Return original state if slot is filled
                  }
              } else {
                  console.error(`Invalid target slot: Page ${currentPageIndex}, Index ${targetIndex}`);
                  toast({ title: "Error", description: "Invalid target slot specified.", variant: "destructive" });
                  return currentPages; // Return original state on error
              }
          } else {
              // Generic upload: Find available slots across pages
              let currentFileIdx = 0;
              for (let p = 0; p < newPages.length && currentFileIdx < filesToProcess.length; p++) {
                  for (let i = 0; i < newPages[p].items.length && currentFileIdx < filesToProcess.length; i++) {
                      if (newPages[p].items[i] === null) {
                          slotsToFill.push({ pageIndex: p, itemIndex: i });
                          currentFileIdx++;
                      }
                  }
              }

              // If more files than slots, add new pages
              while (currentFileIdx < filesToProcess.length) {
                  const newPage: Page = {
                      id: crypto.randomUUID(),
                      items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null),
                      rows: DEFAULT_ROWS,
                      cols: DEFAULT_COLS,
                  };
                  newPages.push(newPage);
                  const newPageIndex = newPages.length - 1;
                  console.log(`Adding new page ${newPageIndex} for excess files.`);
                  for (let i = 0; i < newPage.items.length && currentFileIdx < filesToProcess.length; i++) {
                     if (newPage.items[i] === null) { // Should always be null initially
                          slotsToFill.push({ pageIndex: newPageIndex, itemIndex: i });
                          currentFileIdx++;
                      }
                  }
              }
              console.log(`Found/Created ${slotsToFill.length} slots for ${filesToProcess.length} files.`);
          }

          // --- Process files and update pages ---
          // Read all files concurrently
          const readPromises = filesToProcess.slice(0, slotsToFill.length).map(file => readFileAsDataURL(file));

          // Need an async IIFE to handle promises within the synchronous scope of setPages updater
          (async () => {
              const imageDatas = await Promise.all(readPromises);

              let actuallyAddedCount = 0;
              imageDatas.forEach((imageData, index) => {
                  if (imageData && index < slotsToFill.length) {
                      const { pageIndex, itemIndex } = slotsToFill[index];
                      if (newPages[pageIndex] && newPages[pageIndex].items[itemIndex] === null) {
                           const newItem: ImageItem = {
                               id: crypto.randomUUID(),
                               src: imageData.src,
                               label: '',
                               fileType: imageData.fileType,
                           };
                          newPages[pageIndex].items[itemIndex] = newItem;
                          actuallyAddedCount++;
                      } else {
                           console.warn(`Slot [${pageIndex}, ${itemIndex}] was unexpectedly filled or invalid when trying to add image.`);
                      }
                  }
              });

              console.log(`Processed ${imageDatas.length} files. Added ${actuallyAddedCount} images.`);

              if (actuallyAddedCount > 0) {
                 toast({
                     title: "Upload Successful",
                     description: `${actuallyAddedCount} image(s) added.`,
                 });
              } else if (filesToProcess.length > 0) {
                 // If files were selected but none could be added (e.g., all slots filled or read errors)
                 toast({
                     title: "Upload Failed",
                     description: "No images could be added. Check available slots or file integrity.",
                     variant: "destructive",
                 });
              }

              // Update the state with the modified newPages array
              // This needs to be done carefully if the async IIFE finishes *after* the main setPages returns.
              // A better pattern might be needed if this causes issues, like managing loading state
              // and updating pages *after* all promises resolve outside the initial setPages.
              // For now, let's assume this works in most scenarios.
              // **Correction:** We MUST call setPages again after the async operation completes.
              // The initial setPages call only returns the *initial* state or a potentially partially modified one.
              setPages(newPages); // This line is crucial to update state AFTER async operations

          })(); // Immediately invoke the async function

          // IMPORTANT: The immediate return value of the setPages updater might not reflect
          // the final state if async operations are involved. We return the initially copied
          // state here, and the final update happens when the async IIFE calls setPages again.
          // This might cause a flicker, consider adding loading states.
          return newPages; // Return the state *as it is* at the end of the synchronous part

      }); // End of setPages functional update
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
    if (isNaN(numValue) || numValue < 1) return;

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

        // Check if current page index needs adjustment (e.g., if resizing reduces total pages implicitly - though not the case here)
        // This is more relevant if the action could delete pages.
        // setCurrentPageIndex(prevIdx => Math.min(prevIdx, newPages.length - 1)); // Example adjustment if needed

        return { ...page, rows: newRows, cols: newCols, items: newItems };
      }
      return page;
    }));
    // Update current page index if it becomes invalid (e.g., > new number of pages - though not applicable here)
    // setCurrentPageIndex(prevIndex => Math.min(prevIndex, pages.length - 1));
  };


 const handleDeleteImage = (imageId: string) => {
    setPages(prevPages => prevPages.map((page, pIndex) => {
      if (pIndex === currentPageIndex) {
        return {
          ...page,
          items: page.items.map(item =>
            item?.id === imageId ? null : item // Set to null to remove
          ),
        };
      }
      return page;
    }));
     toast({
      title: "Image Removed",
      description: "The image has been removed from the grid.",
      // Using default variant for removal confirmation
     });
  };

 const addPage = () => {
     const newPage: Page = {
       id: crypto.randomUUID(),
       items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null),
       rows: DEFAULT_ROWS,
       cols: DEFAULT_COLS,
     };
    setPages(prevPages => {
         const updatedPages = [...prevPages, newPage];
         // No need to set current page index here, let useEffect handle it if needed,
         // or handle it in the caller if specific navigation is required.
         return updatedPages;
     });
     setCurrentPageIndex(pages.length); // Navigate to the newly added page index (which is the old length)
     toast({
       title: "Page Added",
       description: `Page ${pages.length + 1} has been created.`,
     });
  };

 const deletePage = (pageIndexToDelete: number) => {
     if (pages.length <= 1) {
         toast({
             title: "Cannot Delete",
             description: "You must have at least one page.",
             variant: "destructive",
         });
         return;
     }

     const deletedPageNum = pageIndexToDelete + 1;

     setPages(prevPages => prevPages.filter((_, index) => index !== pageIndexToDelete));

     // Adjust current page index *after* state update potential
     // Use useEffect to handle index adjustments safely after render
     setCurrentPageIndex(prevIndex => {
       if (prevIndex === pageIndexToDelete) {
         // If deleting the current page, move to the previous one, or 0 if it was the first
         return Math.max(0, prevIndex - 1);
       } else if (prevIndex > pageIndexToDelete) {
         // If deleting a page before the current one, shift the index down
         return prevIndex - 1;
       }
       // Otherwise, the index remains the same
       return prevIndex;
     });


     toast({
      title: "Page Deleted",
      description: `Page ${deletedPageNum} has been deleted.`,
      variant: "destructive", // Destructive action notification
     });
  };


  const goToNextPage = () => {
    setCurrentPageIndex(prevIndex => Math.min(prevIndex + 1, pages.length - 1));
  };

  const goToPrevPage = () => {
     setCurrentPageIndex(prevIndex => Math.max(0, prevIndex - 1));
  };

 // Effect to adjust currentPageIndex if it becomes invalid after page deletion
 useEffect(() => {
    if (currentPageIndex >= pages.length && pages.length > 0) {
      setCurrentPageIndex(pages.length - 1);
    } else if (pages.length === 0) {
        // Handle case where all pages are deleted - maybe add a default one back?
        // For now, just set index to 0, though there's no page.
        // A better approach would be to ensure at least one page always exists.
        // Or display an "empty state" UI.
        setCurrentPageIndex(0);
        // If pages array is empty, consider adding a default page back
        if (pages.length === 0) {
             setPages([{ id: crypto.randomUUID(), items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null), rows: DEFAULT_ROWS, cols: DEFAULT_COLS }]);
             setCurrentPageIndex(0);
        }
    }
 }, [pages, currentPageIndex]);


 const exportToPDF = useCallback(async () => {
    if (isLoadingPDF) return;
    setIsLoadingPDF(true);
    toast({ title: 'Generating PDF...', description: 'Please wait.' });

    const pdf = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: 'a4'
    });

    // --- Font Handling ---
    // jsPDF has limited built-in UTF-8 support. Helvetica/Arial might work for *some* chars.
    // For full support, embedding a font like NotoSans is the robust solution.
    // This requires generating a VFS file for the font.
    // Example (if NotoSans VFS file is generated and imported as NotoSans_Regular):
    /*
    try {
      // pdf.addFileToVFS('NotoSans-Regular-normal.ttf', NotoSans_Regular); // Font file Base64 encoded in the JS
      // pdf.addFont('NotoSans-Regular-normal.ttf', 'NotoSans', 'normal');
      // pdf.setFont('NotoSans', 'normal');
       pdf.setFont('Helvetica', 'normal'); // Fallback
       console.log("Using Helvetica font for PDF.");
    } catch (fontError) {
        console.error("Error setting PDF font, using default:", fontError);
        toast({ title: 'Font Warning', description: 'Could not load custom font, some characters might not render correctly.', variant: 'destructive' });
         pdf.setFont(undefined, 'normal'); // Use jsPDF default
    }
    */
     // Using Helvetica as default, acknowledging limitations
     pdf.setFont('Helvetica', 'normal');
     const labelFontSize = 10;
     pdf.setFontSize(labelFontSize);
    // --- End Font Handling ---


    const pageMargin = 40;
    const usableWidth = pdf.internal.pageSize.getWidth() - 2 * pageMargin;
    const usableHeight = pdf.internal.pageSize.getHeight() - 2 * pageMargin;
    const labelAreaHeight = 30; // Allocate space for labels (potentially multi-line)


    try {
        for (let p = 0; p < pages.length; p++) {
            const pageData = pages[p];
            const { rows, cols, items } = pageData;
            const totalItemsOnPage = items.filter(item => item !== null).length;

            if (p > 0) pdf.addPage();

            // Add Page Number Header
             pdf.setFontSize(9);
             pdf.setTextColor(150); // Light gray
             pdf.text(`Page ${p + 1} of ${pages.length}`, pdf.internal.pageSize.getWidth() - pageMargin, pageMargin / 2, { align: 'right' });
             pdf.setTextColor(0); // Reset text color
             pdf.setFontSize(labelFontSize); // Reset font size for content


             if (totalItemsOnPage === 0 && pages.length > 1) { // Only show empty message if not the only page
                pdf.setFontSize(12);
                pdf.text(`Page ${p + 1} is empty`, pageMargin, pageMargin + 20);
                pdf.setFontSize(labelFontSize);
                continue;
            } else if (totalItemsOnPage === 0 && pages.length === 1) {
                 pdf.setFontSize(12);
                 pdf.text(`Add images to start`, pageMargin, pageMargin + 20);
                 pdf.setFontSize(labelFontSize);
                 continue;
             }

            // --- Grid Calculation ---
            const cellWidth = usableWidth / cols;
            const cellHeight = usableHeight / rows;
            const imageAreaHeight = cellHeight - labelAreaHeight;

            if (imageAreaHeight <= 0) {
                console.error(`Calculated negative/zero image height on page ${p+1}. Rows: ${rows}, Usable Height: ${usableHeight}, Label Height: ${labelAreaHeight}`);
                 toast({ title: 'Layout Error', description: `Cannot render page ${p+1} due to layout issue (image height <= 0). Try fewer rows.`, variant: 'destructive' });
                continue; // Skip this page
            }
            if (cellWidth <= 0) {
                 console.error(`Calculated negative/zero cell width on page ${p+1}. Cols: ${cols}, Usable Width: ${usableWidth}`);
                 toast({ title: 'Layout Error', description: `Cannot render page ${p+1} due to layout issue (cell width <= 0). Try fewer columns.`, variant: 'destructive' });
                 continue; // Skip this page
             }

            const imgPadding = 5; // Padding around image within its area
            const imgMaxWidth = cellWidth - (2 * imgPadding);
            const imgMaxHeight = imageAreaHeight - (2 * imgPadding);
            // --- End Grid Calculation ---


            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item) continue;

                const rowIndex = Math.floor(i / cols);
                const colIndex = i % cols;

                // Cell top-left corner
                const cellX = pageMargin + colIndex * cellWidth;
                const cellY = pageMargin + rowIndex * cellHeight;
                // Image area top-left corner (within cell)
                const imageAreaX = cellX + imgPadding;
                const imageAreaY = cellY + imgPadding;
                // Label area top-left corner (within cell)
                const labelAreaX = cellX;
                const labelAreaY = cellY + imageAreaHeight;


                 try {
                     // Get image dimensions using an Image object
                    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                        const image = new Image();
                        image.onload = () => resolve(image);
                        image.onerror = (err) => {
                             console.error(`Failed to load image for PDF: ${item.id}`, err);
                             reject(new Error(`Failed to load image: ${item.id}`));
                         };
                        image.src = item.src; // item.src is the Data URI
                    });

                    const imgWidth = img.naturalWidth;
                    const imgHeight = img.naturalHeight;
                    if (imgWidth === 0 || imgHeight === 0) {
                        throw new Error(`Image has zero dimensions: ${item.id}`);
                    }
                    const aspectRatio = imgWidth / imgHeight;

                    // Calculate drawing dimensions, fitting within imgMaxWidth and imgMaxHeight
                    let drawWidth = imgMaxWidth;
                    let drawHeight = drawWidth / aspectRatio;

                    if (drawHeight > imgMaxHeight) {
                        drawHeight = imgMaxHeight;
                        drawWidth = drawHeight * aspectRatio;
                    }
                    // Ensure width doesn't exceed max width after height adjustment
                    if (drawWidth > imgMaxWidth) {
                        drawWidth = imgMaxWidth;
                        drawHeight = drawWidth / aspectRatio;
                    }


                    // Center the image within its allocated image area
                    const drawX = imageAreaX + (imgMaxWidth - drawWidth) / 2;
                    const drawY = imageAreaY + (imgMaxHeight - drawHeight) / 2;

                    // Add image to PDF
                    // Determine image type from data URI or fileType
                    let imageFormat = 'JPEG'; // Default
                     if (item.fileType === 'image/png' || item.src.startsWith('data:image/png')) {
                       imageFormat = 'PNG';
                     } else if (item.fileType === 'image/webp' || item.src.startsWith('data:image/webp')) {
                       imageFormat = 'WEBP'; // Requires jsPDF plugin or newer versions
                       // Note: WEBP support might be experimental or require specific jsPDF setup. Test thoroughly.
                       // Fallback to JPEG might be needed if WEBP fails.
                     }
                    pdf.addImage(item.src, imageFormat, drawX, drawY, drawWidth, drawHeight);


                     // Add label below the image
                     if (item.label) {
                         const labelX = labelAreaX + cellWidth / 2; // Center label horizontally
                         const labelY = labelAreaY + labelFontSize + 5; // Position label within its area (+ padding)
                         const labelMaxWidth = cellWidth - (2 * imgPadding); // Max width for label text

                         // Use splitTextToSize for potential multi-line labels and better wrapping.
                         // This is where UTF-8 rendering issues often occur if the font doesn't support the characters.
                         const labelLines = pdf.splitTextToSize(item.label, labelMaxWidth);
                         pdf.text(labelLines, labelX, labelY, { align: 'center', maxWidth: labelMaxWidth });
                     }

                 } catch (imgOrPdfError) {
                     console.error(`Error processing image ${item.id} for PDF:`, imgOrPdfError);
                      // Draw a placeholder in the PDF cell on error
                     const errorX = cellX + 5;
                     const errorY = cellY + 20;
                     pdf.setFontSize(8);
                     pdf.setTextColor(255, 0, 0); // Red color for error
                     pdf.text(`Error adding image ${i+1}`, errorX, errorY, {maxWidth: cellWidth - 10});
                     pdf.setTextColor(0); // Reset color
                     pdf.setFontSize(labelFontSize);
                 }
            }

             // Optional: Draw grid lines for debugging
             // pdf.setDrawColor(200, 200, 200);
             // for (let r = 0; r <= rows; r++) {
             //     const lineY = pageMargin + r * cellHeight;
             //     pdf.line(pageMargin, lineY, usableWidth + pageMargin, lineY);
             // }
             // for (let c = 0; c <= cols; c++) {
             //     const lineX = pageMargin + c * cellWidth;
             //     pdf.line(lineX, pageMargin, lineX, usableHeight + pageMargin);
             // }
             // pdf.setDrawColor(0); // Reset draw color
        }

        pdf.save('gridify_export.pdf');
        toast({ title: 'PDF Generated!', description: 'Your PDF has been downloaded.' });
    } catch (error) {
        console.error('Error generating PDF:', error);
        toast({ title: 'PDF Generation Failed', description: `An error occurred: ${error.message || error}`, variant: 'destructive' });
    } finally {
        setIsLoadingPDF(false);
    }
}, [pages, toast, isLoadingPDF]);


  // --- Render ---
  if (!currentPage) {
     // Handle state where currentPage is not yet available (e.g., during page deletion/navigation)
     return (
         <div className="flex justify-center items-center min-h-screen">
             <Loader2 className="h-16 w-16 animate-spin text-accent" />
             <p className="ml-4 text-muted-foreground">Loading...</p>
         </div>
     );
 }


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
              <Label htmlFor="file-input-button" className="mb-2 block">Upload Images</Label>
              {/* Button to trigger generic upload (targetIndex = null) */}
              <Button id="file-input-button" onClick={() => triggerFileUpload()} className="w-full" variant="outline">
                <Upload className="mr-2 h-4 w-4" /> Choose Images
              </Button>
              {/* Hidden file input, always accepts multiple */}
              <Input
                id="file-input-main" // Unique ID
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                multiple
                accept="image/png, image/jpeg, image/webp" // Specify accepted types
                className="hidden"
                // capture="environment" // Optionally uncomment for mobile camera
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
                     {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <SelectItem key={`row-${n}`} value={String(n)}>{n} Rows</SelectItem>)}
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
             <Button onClick={exportToPDF} className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={isLoadingPDF}>
                {isLoadingPDF ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                   <Download className="mr-2 h-4 w-4" />
                )}
               Export as PDF
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
                 <Button onClick={goToNextPage} disabled={currentPageIndex >= pages.length - 1} size="icon" variant="outline">
                     <ArrowRight className="h-4 w-4"/>
                      <span className="sr-only">Next Page</span>
                 </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {/* Ensure currentPage exists before rendering grid */}
              {currentPage && (
                <div
                    className={`grid gap-4 border border-dashed border-border p-4 rounded-md bg-muted/10`}
                    style={{
                      gridTemplateColumns: `repeat(${currentPage.cols}, minmax(100px, 1fr))`, // Min width for cells
                      gridTemplateRows: `repeat(${currentPage.rows}, minmax(150px, auto))`, // Min height, allow expansion
                      // aspectRatio: `${currentPage.cols} / ${currentPage.rows}`, // Maintain overall grid aspect might be too restrictive
                    }}
                >
                    {/* Generate array based on rows * cols for grid structure */}
                    {Array.from({ length: currentPage.rows * currentPage.cols }).map((_, index) => {
                       const item = currentPage.items[index] ?? null; // Get item or null if index out of bounds or empty
                       return (
                          <div
                            // Use a stable key: item ID if exists, otherwise index for empty slots
                            key={item?.id ?? `empty-slot-${currentPage.id}-${index}`}
                            className="border rounded-md flex flex-col items-center justify-start p-2 relative group bg-card hover:shadow-lg transition-shadow aspect-square" // Use aspect-square for consistent cell shape
                            style={{ minHeight: '150px' }} // Ensure minimum height
                          >
                             {item ? (
                              // --- Display Image and Label ---
                              <>
                                 <div className="flex-grow w-full h-[calc(100%-40px)] flex items-center justify-center overflow-hidden mb-1"> {/* Allocate space for image */}
                                     <img
                                         src={item.src}
                                         alt={`Grid image ${index + 1}`}
                                         className="max-w-full max-h-full object-contain rounded"
                                     />
                                 </div>
                                 <Textarea
                                    value={item.label}
                                    onChange={(e) => handleLabelChange(item.id, e.target.value)}
                                    placeholder="Add label..."
                                    className="w-full text-xs h-[36px] mt-auto resize-none p-1 text-foreground bg-background border-input focus:ring-ring text-center block" // Fixed height, centered text
                                    rows={1} // Start with 1 row, potentially allow more if needed via CSS or state
                                  />
                                 <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded-full p-1 z-10" // Ensure button is on top
                                    onClick={() => handleDeleteImage(item.id)}
                                    aria-label="Delete image"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                 </Button>
                              </>
                             ) : (
                              // --- Empty Slot - Click to Upload ---
                              <button
                                  className="w-full h-full flex flex-col items-center justify-center text-center text-muted-foreground hover:bg-accent/10 transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                                  onClick={() => triggerFileUpload(index)} // Pass the grid index
                                  aria-label={`Add image to slot ${index + 1}`}
                              >
                                  <ImagePlus className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50"/>
                                  <span className="text-sm">Click to add</span>
                              </button>
                             )}
                          </div>
                       );
                    })}
                </div>
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
