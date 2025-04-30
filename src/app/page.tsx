'use client';

import type React from 'react';
import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Grid, FileText, Download, PlusCircle, Trash2, ArrowLeft, ArrowRight } from 'lucide-react';
import jsPDF from 'jspdf';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  const currentPage = pages[currentPageIndex];

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    let pageIdx = currentPageIndex;
    let itemIdx = currentPage.items.findIndex(item => item === null);

    // If current page is full, try to find the next page with space
    if (itemIdx === -1) {
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const firstEmpty = page.items.findIndex(item => item === null);
        if (firstEmpty !== -1) {
          pageIdx = i;
          itemIdx = firstEmpty;
          break;
        }
      }
      // If no page has space, add a new page (or could prompt user)
      if (itemIdx === -1) {
         addPage(); // Automatically adds a new page if all are full
         pageIdx = pages.length; // New page index will be the last one
         itemIdx = 0;
      }
    }

    const newPages = [...pages];
    const targetPage = newPages[pageIdx];

     let currentFileIndex = 0;
     while(currentFileIndex < files.length && itemIdx < targetPage.items.length) {
        const file = files[currentFileIndex];
        const reader = new FileReader();

        reader.onload = (e) => {
          if (e.target?.result) {
             const newItem: ImageItem = {
               id: crypto.randomUUID(),
               src: e.target.result as string,
               label: '',
             };
             // Find the next available slot again in case multiple files filled slots
             let currentItemIdx = targetPage.items.findIndex(item => item === null);
             if (currentItemIdx !== -1) {
                newPages[pageIdx].items[currentItemIdx] = newItem;
                setPages([...newPages]); // Update state after each image load for responsiveness
             } else {
                 // Handle case where the page got filled during async loads
                 // Maybe add to next page or queue? For now, just log.
                 console.warn("Page filled up during upload, some images might not be added.");
             }
          }
        };
        reader.readAsDataURL(file);

        // Find next empty slot for the next file
        itemIdx = targetPage.items.findIndex((item, idx) => item === null && idx > itemIdx);
        if (itemIdx === -1 && currentFileIndex + 1 < files.length) {
            // If no more space on this page, try next pages or add new one
            let foundSpace = false;
             for (let i = pageIdx + 1; i < newPages.length; i++) {
               const nextPage = newPages[i];
               const nextEmpty = nextPage.items.findIndex(item => item === null);
               if (nextEmpty !== -1) {
                 pageIdx = i;
                 itemIdx = nextEmpty;
                 foundSpace = true;
                 break;
               }
             }
             if (!foundSpace) {
                 addPage();
                 pageIdx = newPages.length; // Index adjusted due to addPage potentially modifying array
                 itemIdx = 0;
             }
        }

        currentFileIndex++;
     }


    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Reset file input
    }

     toast({
      title: "Upload Successful",
      description: `${currentFileIndex} image(s) added.`,
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
    const newPage: Page = {
      id: crypto.randomUUID(),
      items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null),
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
    };
    setPages(prevPages => [...prevPages, newPage]);
    setCurrentPageIndex(pages.length); // Switch to the new page
     toast({
      title: "Page Added",
      description: `Page ${pages.length + 1} has been created.`,
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
     setPages(prevPages => prevPages.filter((_, index) => index !== pageIndex));
     // Adjust current page index if necessary
     if (currentPageIndex >= pageIndex && currentPageIndex > 0) {
         setCurrentPageIndex(prevIndex => prevIndex - 1);
     } else if (currentPageIndex === pageIndex && pages.length > 1) {
        setCurrentPageIndex(0); // Go to first page if deleted page was the current one and there are others
     }
     toast({
      title: "Page Deleted",
      description: `Page ${pageIndex + 1} has been deleted.`,
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
    const pageMargin = 40; // Margin in points
    const pageWidth = pdf.internal.pageSize.getWidth() - 2 * pageMargin;
    const pageHeight = pdf.internal.pageSize.getHeight() - 2 * pageMargin;
    const labelHeight = 20; // Estimated height for the label below image

    try {
        for (let p = 0; p < pages.length; p++) {
            const pageData = pages[p];
            const { rows, cols, items } = pageData;
            const totalImages = items.filter(item => item !== null).length;

            if (totalImages === 0) {
                if(p > 0) pdf.addPage(); // Add blank page only if it's not the first page and it's empty
                pdf.setFontSize(12);
                pdf.text(`Page ${p + 1} (empty)`, pageMargin, pageMargin + 12);
                continue; // Skip empty pages for image processing
            }

             if (p > 0) pdf.addPage();

            const cellWidth = pageWidth / cols;
            const cellHeight = (pageHeight / rows) - labelHeight; // Adjust cell height for label space
            const imgMaxWidth = cellWidth * 0.9; // Max width of image within cell (leave some padding)
            const imgMaxHeight = cellHeight * 0.9; // Max height of image within cell

            pdf.setFontSize(10); // Set font size for labels

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item) continue;

                const rowIndex = Math.floor(i / cols);
                const colIndex = i % cols;

                const x = pageMargin + colIndex * cellWidth;
                const y = pageMargin + rowIndex * (cellHeight + labelHeight); // Adjust y for label space

                 try {
                    const img = new Image();
                    img.src = item.src;
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
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

                    // Center the image within its cell area
                    const drawX = x + (cellWidth - drawWidth) / 2;
                    const drawY = y + (cellHeight - drawHeight) / 2;


                    pdf.addImage(item.src, 'JPEG', drawX, drawY, drawWidth, drawHeight); // Or PNG depending on upload

                     // Add label below the image
                     if (item.label) {
                         const labelY = drawY + drawHeight + 10; // Position label below image
                         pdf.text(item.label, drawX, labelY, { maxWidth: cellWidth });
                     }

                 } catch (imgError) {
                     console.error(`Error loading or adding image ${item.id} to PDF:`, imgError);
                     // Optionally draw a placeholder or error message in the PDF
                     pdf.text('Error loading image', x + 5, y + 20);
                 }
            }
             // Draw grid lines (optional, based on UI preference)
             pdf.setDrawColor(200, 200, 200); // Light gray lines
             for (let r = 1; r < rows; r++) {
                 pdf.line(pageMargin, pageMargin + r * (cellHeight + labelHeight), pageWidth + pageMargin, pageMargin + r * (cellHeight + labelHeight));
             }
             for (let c = 1; c < cols; c++) {
                 pdf.line(pageMargin + c * cellWidth, pageMargin, pageMargin + c * cellWidth, pageHeight + pageMargin);
             }

             pdf.setDrawColor(51, 51, 51); // Reset draw color back to default (dark gray) for borders if needed elsewhere
        }

        pdf.save('gridify_export.pdf');
        toast({ title: 'PDF Generated!', description: 'Your PDF has been downloaded.' });
    } catch (error) {
        console.error('Error generating PDF:', error);
        toast({ title: 'PDF Generation Failed', description: 'An error occurred while generating the PDF.', variant: 'destructive' });
    }
}, [pages, toast]);

  return (
    <div className="container mx-auto p-4 flex flex-col min-h-screen">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-center">Gridify</h1>
        <p className="text-center text-muted-foreground">Arrange images in grids and export as PDF</p>
      </header>

      <div className="flex flex-col md:flex-row gap-6 flex-grow">
        {/* Controls Panel */}
        <Card className="w-full md:w-1/4 h-fit sticky top-4">
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="image-upload" className="mb-2 block">Upload Images</Label>
              <Button onClick={() => fileInputRef.current?.click()} className="w-full" variant="outline">
                <Upload className="mr-2 h-4 w-4" /> Choose Images
              </Button>
              <Input
                id="image-upload"
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                multiple
                accept="image/*"
                className="hidden"
              />
            </div>
            <Separator />
             <div>
               <Label className="mb-2 block">Grid Layout (Page {currentPageIndex + 1})</Label>
               <div className="flex gap-2">
                 <Select onValueChange={(value) => handleGridChange('rows', value)} value={String(currentPage.rows)}>
                   <SelectTrigger className="w-full">
                     <SelectValue placeholder="Rows" />
                   </SelectTrigger>
                   <SelectContent>
                     {[1, 2, 3, 4, 5, 6].map(n => <SelectItem key={`row-${n}`} value={String(n)}>{n} Rows</SelectItem>)}
                   </SelectContent>
                 </Select>
                 <Select onValueChange={(value) => handleGridChange('cols', value)} value={String(currentPage.cols)}>
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
          <Card className="flex-grow">
            <CardHeader className="flex flex-row justify-between items-center">
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
            <CardContent>
              <div
                className={`grid gap-4 border border-dashed border-border p-4 rounded-md`}
                style={{
                  gridTemplateColumns: `repeat(${currentPage.cols}, 1fr)`,
                  gridTemplateRows: `repeat(${currentPage.rows}, minmax(100px, auto))`, // Ensure minimum row height
                }}
              >
                {currentPage.items.map((item, index) => (
                  <div key={item?.id ?? `empty-${index}`} className="border rounded-md flex flex-col items-center justify-center p-2 relative group bg-muted/30 aspect-square min-h-[100px]">
                    {item ? (
                      <>
                        <img src={item.src} alt={`Uploaded ${index}`} className="max-w-full max-h-[70%] object-contain mb-2 rounded"/>
                        <Textarea
                          value={item.label}
                          onChange={(e) => handleLabelChange(item.id, e.target.value)}
                          placeholder="Add label..."
                          className="w-full text-xs h-8 mt-auto resize-none p-1"
                          rows={1}
                        />
                         <Button
                           variant="ghost"
                           size="icon"
                           className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded-full"
                           onClick={() => handleDeleteImage(item.id)}
                           aria-label="Delete image"
                         >
                           <Trash2 className="h-3 w-3" />
                         </Button>
                      </>
                    ) : (
                      <div className="text-center text-muted-foreground text-sm">
                        <Grid className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50"/>
                        Empty Slot
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
       <footer className="text-center mt-8 text-sm text-muted-foreground">
            Built with Next.js, ShadCN UI, and jsPDF.
        </footer>
    </div>
  );
}

// Simple Separator Component
const Separator = () => <hr className="my-4 border-border" />;
