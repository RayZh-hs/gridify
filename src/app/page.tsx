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
// --- Noto Sans Font Import for jsPDF ---
// To support UTF-8 characters correctly in the PDF, you need to:
// 1. Download the Noto Sans Regular font file (e.g., NotoSans-Regular.ttf).
// 2. Convert it into a Base64 encoded JavaScript file compatible with jsPDF's VFS.
//    Tools like fontconverter.js (available online) can do this.
// 3. Place the generated JS file (e.g., `NotoSans-Regular-normal.js`) in your project (e.g., `src/lib/fonts/`).
// 4. Uncomment the import line below and adjust the path if necessary.
// If the import fails, the code will fall back to Helvetica, potentially causing rendering issues for non-Latin characters.
// import { NotoSans_Regular } from '@/lib/fonts/NotoSans-Regular-normal.js';
// --- End Noto Sans Font Import ---

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
          // Basic validation for image types client-side
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
              console.error("Unsupported file type:", file.name, file.type);
              toast({ title: "Unsupported File Type", description: `Skipping file ${file.name}. Only JPEG, PNG, WEBP are supported.`, variant: "destructive" });
              resolve(null);
              return;
          }

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
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) {
          directUploadIndexRef.current = null; // Reset ref
          return;
      }

      const targetIndex = directUploadIndexRef.current;
      directUploadIndexRef.current = null; // Reset ref immediately after use

      let filesToProcess: File[] = Array.from(files);

      // Process files asynchronously and then update state once
      processFilesAndUpdateState(filesToProcess, targetIndex);
  };

  // Separated async logic for processing files and updating state
  const processFilesAndUpdateState = async (files: File[], targetSlotIndex: number | null) => {
    let filesAddedCount = 0;
    let pagesNeedUpdate = false;

    // Read all valid files concurrently
    const readPromises = files.map(file => readFileAsDataURL(file));
    const imageDatas = (await Promise.all(readPromises)).filter(data => data !== null) as Omit<ImageItem, 'id' | 'label'>[];

    if (imageDatas.length === 0 && files.length > 0) {
         toast({ title: "Upload Failed", description: "No valid images could be processed.", variant: "destructive" });
         return; // No valid images to add
    }
     if (imageDatas.length < files.length) {
        toast({ title: "Partial Upload", description: `${files.length - imageDatas.length} file(s) were skipped due to errors or unsupported types.`, variant: "default" });
     }


    setPages(currentPages => {
        let newPages = JSON.parse(JSON.stringify(currentPages)); // Deep copy for mutation
        let currentImageIndex = 0;

        if (targetSlotIndex !== null && imageDatas.length > 0) {
            // Direct slot upload: Try to place the first valid image
            if (targetSlotIndex < newPages[currentPageIndex]?.items.length) {
                 if (newPages[currentPageIndex].items[targetSlotIndex] === null) {
                     const imageData = imageDatas[0]; // Use the first successfully read image
                     newPages[currentPageIndex].items[targetSlotIndex] = {
                         id: crypto.randomUUID(),
                         src: imageData.src,
                         label: '',
                         fileType: imageData.fileType,
                     };
                     filesAddedCount++;
                     pagesNeedUpdate = true;
                      if (imageDatas.length > 1) {
                         toast({ title: "Notice", description: "Only the first valid image was added to the specific slot.", variant: "default" });
                     }
                     // Set remaining images to be handled by generic logic if any
                     currentImageIndex = 1; // Start generic filling from the second image
                 } else {
                     toast({ title: "Slot Filled", description: "The selected slot is already occupied.", variant: "destructive" });
                     // Keep remaining images for generic filling attempt
                 }
            } else {
                 toast({ title: "Error", description: "Invalid target slot specified.", variant: "destructive" });
                 // Keep remaining images for generic filling attempt
            }
             // If direct upload failed or used only the first image, remaining images fall through to generic upload below.
        }

        // Generic upload: Fill available slots, starting from currentImageIndex
        for (let p = 0; p < newPages.length && currentImageIndex < imageDatas.length; p++) {
            for (let i = 0; i < newPages[p].items.length && currentImageIndex < imageDatas.length; i++) {
                if (newPages[p].items[i] === null) {
                    const imageData = imageDatas[currentImageIndex];
                    newPages[p].items[i] = {
                        id: crypto.randomUUID(),
                        src: imageData.src,
                        label: '',
                        fileType: imageData.fileType,
                    };
                    filesAddedCount++;
                    pagesNeedUpdate = true;
                    currentImageIndex++;
                }
            }
        }

        // Add new pages if necessary for remaining images
        while (currentImageIndex < imageDatas.length) {
            const newPage: Page = {
                id: crypto.randomUUID(),
                items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null),
                rows: DEFAULT_ROWS,
                cols: DEFAULT_COLS,
            };
            newPages.push(newPage);
            pagesNeedUpdate = true;
            const newPageIndex = newPages.length - 1;

            for (let i = 0; i < newPage.items.length && currentImageIndex < imageDatas.length; i++) {
                const imageData = imageDatas[currentImageIndex];
                newPage.items[i] = { // Directly modify the newPage items array
                    id: crypto.randomUUID(),
                    src: imageData.src,
                    label: '',
                    fileType: imageData.fileType,
                };
                filesAddedCount++;
                currentImageIndex++;
            }
        }

        // Only return new state if changes were made
        if (pagesNeedUpdate) {
            if (filesAddedCount > 0) {
                toast({ title: "Upload Successful", description: `${filesAddedCount} image(s) added.` });
            }
            return newPages; // Return the modified state
        } else {
            // If no files were added (e.g., only tried direct upload to filled slot and had no other files)
            if (files.length > 0 && targetSlotIndex !== null && filesAddedCount === 0) {
                 // Already handled by "Slot Filled" toast
            } else if (files.length > 0 && filesAddedCount === 0) {
                // Generic upload attempt but no slots found and no new pages needed (shouldn't happen with current logic)
                 toast({ title: "Upload Info", description: "No empty slots found for the uploaded images.", variant: "default" });
            }
            return currentPages; // No changes, return original state
        }
    });
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
            item?.id === imageId ? null : item // Set to null to remove
          ),
        };
      }
      return page;
    }));
     toast({
      title: "Image Removed",
      description: "The image has been removed from the grid.",
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
      variant: "destructive",
     });
  };


  const goToNextPage = () => {
    setCurrentPageIndex(prevIndex => Math.min(prevIndex + 1, pages.length - 1));
  };

  const goToPrevPage = () => {
     setCurrentPageIndex(prevIndex => Math.max(0, prevIndex - 1));
  };

 // Effect to adjust currentPageIndex if it becomes invalid after page deletion or initialization
 useEffect(() => {
    if (pages.length === 0) {
      // Ensure there's always at least one page
      setPages([{ id: crypto.randomUUID(), items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null), rows: DEFAULT_ROWS, cols: DEFAULT_COLS }]);
      setCurrentPageIndex(0);
    } else if (currentPageIndex >= pages.length) {
      // If index is out of bounds after deletion, go to the last valid page
      setCurrentPageIndex(pages.length - 1);
    }
  }, [pages, currentPageIndex]);


 const exportToPDF = useCallback(async () => {
    if (isLoadingPDF) return;
    setIsLoadingPDF(true);
    toast({ title: 'Generating PDF...', description: 'Please wait.' });

    const pdf = new jsPDF({
        orientation: 'p', // Portrait
        unit: 'pt',     // Points
        format: 'a4'     // A4 page size
    });

    // --- Font Handling for UTF-8 ---
    let fontLoaded = false;
    try {
        // Check if the imported font variable exists (if uncommented and successful)
        // @ts-ignore - Check if NotoSans_Regular is defined (if imported)
        if (typeof NotoSans_Regular !== 'undefined') {
          // pdf.addFileToVFS('NotoSans-Regular-normal.ttf', NotoSans_Regular); // Add font file from imported Base64 string
          // pdf.addFont('NotoSans-Regular-normal.ttf', 'NotoSans', 'normal');
          // pdf.setFont('NotoSans', 'normal');
          // console.log("Using NotoSans font for PDF.");
          // fontLoaded = true;

          // TEMPORARY: Until font embedding is confirmed working, stick to Helvetica
           pdf.setFont('Helvetica', 'normal');
           console.warn("NotoSans font import detected but temporarily using Helvetica. Uncomment VFS lines to enable.");

        } else {
          console.log("NotoSans font not available, using Helvetica (limited UTF-8).");
          pdf.setFont('Helvetica', 'normal');
        }
    } catch (fontError) {
        console.error("Error loading/setting PDF font:", fontError);
        toast({ title: 'Font Warning', description: 'Could not set custom font, using default (limited UTF-8).', variant: 'destructive' });
        pdf.setFont('Helvetica', 'normal'); // Fallback explicitly
    }
    const labelFontSize = 10;
    pdf.setFontSize(labelFontSize);
    // --- End Font Handling ---


    const pageMargin = 40;
    const usableWidth = pdf.internal.pageSize.getWidth() - 2 * pageMargin;
    const usableHeight = pdf.internal.pageSize.getHeight() - 2 * pageMargin;
    const labelAreaHeight = 30; // Keep space for labels, adjust calculation below

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

            if (totalItemsOnPage === 0) {
                 pdf.setFontSize(12);
                 pdf.text(`Page ${p + 1} is empty`, pageMargin, pageMargin + 20);
                 pdf.setFontSize(labelFontSize);
                 continue;
            }

            // --- Grid Calculation ---
            const cellWidth = usableWidth / cols;
            // Calculate total height needed per cell (image + label + padding)
            // This is an estimate; actual image height varies.
            // Let's make cell height dependent on rows, but image fitting handles the vertical space.
             const cellHeight = usableHeight / rows;
             // Height available *within* the cell *before* considering label
             const availableCellHeight = cellHeight - 5; // Small bottom padding for cell

            if (cellWidth <= 10 || availableCellHeight <= labelAreaHeight + 10) { // Ensure minimal space
                console.error(`Layout issue on page ${p+1}: Cell dimensions too small. W:${cellWidth}, H:${availableCellHeight}`);
                toast({ title: 'Layout Error', description: `Cannot render page ${p+1}. Try fewer rows/columns.`, variant: 'destructive' });
                continue; // Skip this page
            }

            const imgPadding = 5; // Padding around image within its area
            const imgMaxWidth = cellWidth - (2 * imgPadding);
            // Max height for the image *itself*, considering space needed for the label below it
            const imgMaxHeight = availableCellHeight - labelAreaHeight - imgPadding; // Subtract label space and top padding


            if (imgMaxHeight <= 0) {
                 console.error(`Calculated negative/zero image max height on page ${p+1}. Rows: ${rows}, CellH: ${cellHeight}, LabelH: ${labelAreaHeight}`);
                 toast({ title: 'Layout Error', description: `Cannot render page ${p+1} (img height <= 0). Try fewer rows.`, variant: 'destructive' });
                 continue; // Skip this page
             }
            // --- End Grid Calculation ---


            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item) continue;

                const rowIndex = Math.floor(i / cols);
                const colIndex = i % cols;

                // Cell top-left corner
                const cellX = pageMargin + colIndex * cellWidth;
                const cellY = pageMargin + rowIndex * cellHeight;

                 try {
                    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                        const image = new Image();
                        image.onload = () => resolve(image);
                        image.onerror = (err) => reject(new Error(`Failed to load image: ${item.id}`));
                        image.src = item.src;
                    });

                    const imgWidth = img.naturalWidth;
                    const imgHeight = img.naturalHeight;
                    if (imgWidth === 0 || imgHeight === 0) throw new Error(`Image has zero dimensions: ${item.id}`);

                    const aspectRatio = imgWidth / imgHeight;

                    // Calculate drawing dimensions, fitting within imgMaxWidth and imgMaxHeight
                    let drawWidth = imgMaxWidth;
                    let drawHeight = drawWidth / aspectRatio;

                    if (drawHeight > imgMaxHeight) {
                        drawHeight = imgMaxHeight;
                        drawWidth = drawHeight * aspectRatio;
                    }
                    if (drawWidth > imgMaxWidth) { // Recalculate if width constraint hit after height adjustment
                        drawWidth = imgMaxWidth;
                        drawHeight = drawWidth / aspectRatio;
                    }

                    // Center the image horizontally within the cell's width
                    const drawX = cellX + (cellWidth - drawWidth) / 2;
                    // Position the image at the top of the cell (considering padding)
                    const drawY = cellY + imgPadding;

                    // Add image to PDF
                    let imageFormat = 'JPEG'; // Default
                    if (item.fileType.includes('png')) imageFormat = 'PNG';
                    else if (item.fileType.includes('webp')) imageFormat = 'WEBP'; // Requires newer jsPDF or plugin

                    pdf.addImage(item.src, imageFormat, drawX, drawY, drawWidth, drawHeight);

                    // --- Add label below the image ---
                    if (item.label) {
                        const labelX = cellX + cellWidth / 2; // Center label horizontally in cell
                        // Position label *directly below* the drawn image + small gap
                        const labelY = drawY + drawHeight + 5 + labelFontSize; // Image bottom + gap + font size approx baseline start
                        const labelMaxWidth = cellWidth - (2 * imgPadding);

                        // Use splitTextToSize for wrapping
                        const labelLines = pdf.splitTextToSize(item.label, labelMaxWidth);

                        // Check if label exceeds allocated label area (crude check)
                        const requiredLabelHeight = labelLines.length * labelFontSize * 1.2; // Estimate line height
                        if (labelY + requiredLabelHeight > cellY + cellHeight) {
                             console.warn(`Label for item ${i+1} might overflow cell bounds.`);
                             // Optionally truncate or indicate overflow
                        }

                        pdf.text(labelLines, labelX, labelY, { align: 'center', maxWidth: labelMaxWidth, baseline: 'top' }); // Align baseline to top
                    }

                 } catch (imgOrPdfError) {
                     console.error(`Error processing image ${item.id} for PDF:`, imgOrPdfError);
                     const errorX = cellX + 5;
                     const errorY = cellY + 20;
                     pdf.setFontSize(8);
                     pdf.setTextColor(255, 0, 0); // Red
                     pdf.text(`Error image ${i+1}`, errorX, errorY, {maxWidth: cellWidth - 10});
                     pdf.setTextColor(0); // Reset color
                     pdf.setFontSize(labelFontSize); // Reset font size
                 }
            }
        }

        pdf.save('gridify_export.pdf');
        toast({ title: 'PDF Generated!', description: 'Your PDF has been downloaded.' });
    } catch (error) {
        console.error('Error generating PDF:', error);
        toast({ title: 'PDF Generation Failed', description: `An error occurred: ${error.message || error}`, variant: 'destructive' });
    } finally {
        setIsLoadingPDF(false);
    }
}, [pages, currentPageIndex, toast, isLoadingPDF]); // Added currentPageIndex dependency


  // --- Render ---
  if (!currentPage) {
     return (
         <div className="flex justify-center items-center min-h-screen">
             <Loader2 className="h-16 w-16 animate-spin text-accent" />
             <p className="ml-4 text-muted-foreground">Loading page...</p>
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
              <Button id="file-input-button" onClick={() => triggerFileUpload()} className="w-full" variant="outline">
                <Upload className="mr-2 h-4 w-4" /> Choose Images
              </Button>
              <Input
                id="file-input-main"
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                multiple
                accept="image/png, image/jpeg, image/webp"
                className="hidden"
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
             <Button onClick={exportToPDF} className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={isLoadingPDF || pages.length === 0 || pages[currentPageIndex]?.items.every(item => item === null) }>
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
              {currentPage && (
                <div
                    className={`grid gap-4 border border-dashed border-border p-4 rounded-md bg-muted/10`}
                    style={{
                      gridTemplateColumns: `repeat(${currentPage.cols}, minmax(100px, 1fr))`,
                      gridAutoRows: `minmax(150px, auto)`, // Ensure rows have a min height but can grow
                    }}
                >
                    {Array.from({ length: currentPage.rows * currentPage.cols }).map((_, index) => {
                       const item = currentPage.items[index] ?? null;
                       return (
                          <div
                            key={item?.id ?? `empty-slot-${currentPage.id}-${index}`}
                            className="border rounded-md flex flex-col items-center p-2 relative group bg-card hover:shadow-lg transition-shadow overflow-hidden" // Removed aspect-square, added overflow-hidden
                            style={{ minHeight: '150px' }} // Keep min height
                          >
                             {item ? (
                              // --- Display Image and Label ---
                              <>
                                 {/* Image container - allows image to take available space, pushing label down */}
                                 <div className="w-full flex-shrink-0 flex items-center justify-center overflow-hidden mb-1 flex-grow">
                                     <img
                                         src={item.src}
                                         alt={`Grid image ${index + 1}`}
                                         className="max-w-full max-h-full object-contain rounded"
                                         // style={{ maxHeight: 'calc(100% - 40px)' }} // Limit image height to leave space for label (adjust 40px as needed)
                                     />
                                 </div>
                                 {/* Label Container - occupies remaining space at the bottom */}
                                  <div className="w-full mt-auto flex-shrink-0 h-[40px]"> {/* Fixed height container for textarea */}
                                     <Textarea
                                        value={item.label}
                                        onChange={(e) => handleLabelChange(item.id, e.target.value)}
                                        placeholder="Add label..."
                                        className="w-full text-xs resize-none p-1 text-foreground bg-background border-input focus:ring-ring text-center block h-full" // Use h-full to fill container
                                        rows={2} // Allow up to 2 rows, adjust as needed
                                      />
                                  </div>
                                 <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded-full p-1 z-10"
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
                                  onClick={() => triggerFileUpload(index)}
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
                {/* Message shown if the current page is empty */}
               {currentPage && currentPage.items.every(item => item === null) && (
                   <div className="text-center text-muted-foreground mt-8">
                       <p>This page is empty.</p>
                       <p>Click "Choose Images" or click on an empty slot to add images.</p>
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
```
  </change>
  <change>
    <file>src/lib/fonts/NotoSans-Regular-normal.js</file>
    <description>Add placeholder file for NotoSans font VFS data. User needs to generate the actual content using a tool like fontconverter.js and replace this placeholder.</description>
    <content><![CDATA[// --- Placeholder for Noto Sans Regular Font VFS Data ---
//
// This file is a placeholder. To enable full UTF-8 character support in PDFs,
// you need to generate the actual jsPDF Virtual File System (VFS) data for
// the Noto Sans Regular font and replace the content of this file with it.
//
// Instructions:
// 1. Download the Noto Sans Regular font file (e.g., NotoSans-Regular.ttf).
//    You can find it on Google Fonts: https://fonts.google.com/noto/specimen/Noto+Sans
// 2. Use an online or offline tool to convert the .ttf file into a Base64 encoded
//    JavaScript file compatible with jsPDF's VFS. A common tool is `fontconverter.js`
//    (you might find versions online or need to set one up locally).
// 3. The output will be a JavaScript file containing something like:
//    `export const NotoSans_Regular = 'AAEAAAARAQAABAAQRFNJR... (very long Base64 string)';`
// 4. Replace the entire content of this placeholder file (`src/lib/fonts/NotoSans-Regular-normal.js`)
//    with the content generated in step 3.
// 5. Uncomment the import line in `src/app/page.tsx`:
//    `import { NotoSans_Regular } from '@/lib/fonts/NotoSans-Regular-normal.js';`
// 6. Uncomment the VFS registration lines within the `exportToPDF` function in `src/app/page.tsx`:
//    `pdf.addFileToVFS('NotoSans-Regular-normal.ttf', NotoSans_Regular);`
//    `pdf.addFont('NotoSans-Regular-normal.ttf', 'NotoSans', 'normal');`
//    `pdf.setFont('NotoSans', 'normal');`
// 7. You might need to comment out the fallback `pdf.setFont('Helvetica', 'normal');` lines after enabling NotoSans.
//
// After completing these steps, jsPDF should use Noto Sans for rendering text in the PDF,
// providing much better support for various UTF-8 characters.
//
// --- End Placeholder ---

// If you don't generate the font file, leave this export line here
// so the import in page.tsx doesn't cause a hard error, although the font won't load.
export const NotoSans_Regular = undefined;
