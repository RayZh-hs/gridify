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
// --- Noto Sans Font Import ---
import { NotoSansSC_Regular } from '@/lib/fonts/NotoSansSC-Regular-normal.js'; // Assuming you fixed this based on previous steps
console.info("Font Base64 Length:", NotoSansSC_Regular?.length ?? 'Not Loaded');
// --- End Noto Sans Font Import ---

import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

interface ImageItem {
  id: string;
  src: string; // Original Data URI
  label: string;
  fileType: string; // Original file type (e.g., 'image/jpeg', 'image/png', 'image/bmp', 'image/gif')
}

interface Page {
  id: string;
  items: (ImageItem | null)[];
  rows: number;
  cols: number;
  orientation: 'p' | 'l'; // This property is now unused for PDF export orientation
}

const DEFAULT_ROWS = 1;
const DEFAULT_COLS = 1;
const DEFAULT_ORIENTATION = 'p';
const DEFAULT_PAGE_SIZE = 'a4'; // Default global page size

// Define supported types for direct PDF inclusion and types needing conversion
const PDF_DIRECT_SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_TYPES_TO_CONVERT = ['image/bmp', 'image/gif', 'image/tiff']; // Add types needing canvas conversion
const ALL_ACCEPTED_TYPES = [...PDF_DIRECT_SUPPORTED_TYPES, ...IMAGE_TYPES_TO_CONVERT];
const ACCEPT_STRING = ALL_ACCEPTED_TYPES.join(',') + ',.jpg,.jpeg,.png,.webp,.bmp,.gif,.tif,.tiff'; // For file input

export default function Home() {
  // Initialize first page with default orientation (orientation property is unused for PDF export)
  const [pages, setPages] = useState<Page[]>([{
    id: crypto.randomUUID(),
    items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null),
    rows: DEFAULT_ROWS,
    cols: DEFAULT_COLS,
    orientation: DEFAULT_ORIENTATION // Initial value for the state property (not used for PDF export orientation)
  }]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<string>(DEFAULT_PAGE_SIZE); // State for global page size
  // --- State for global page orientation ---
  const [pageOrientation, setPageOrientation] = useState<'p' | 'l'>(DEFAULT_ORIENTATION);
  // --- End State ---

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoadingPDF, setIsLoadingPDF] = useState(false);
  const { toast } = useToast();

  const currentPage = pages[currentPageIndex];
  const directUploadIndexRef = useRef<number | null>(null);

  const triggerFileUpload = (targetIndex: number | null = null) => {
    directUploadIndexRef.current = targetIndex;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  // Reads a single file and returns a Promise with the ImageItem data or null on error
  const readFileAsDataURL = (file: File): Promise<Omit<ImageItem, 'id' | 'label'> | null> => {
    return new Promise((resolve) => {
      // *** UPDATED VALIDATION ***
      if (!ALL_ACCEPTED_TYPES.includes(file.type)) {
        console.warn("Unsupported file type during upload attempt:", file.name, file.type);
        toast({ title: "Unsupported File Type", description: `Skipping file ${file.name}. Type ${file.type} is not supported.`, variant: "destructive" });
        resolve(null);
        return;
      }
      if (file.type === 'image/tiff') {
        toast({ title: "TIFF Uploaded", description: `Note: ${file.name} (TIFF) might not display correctly in the browser preview, but will be converted for PDF export.`, variant: "default" });
      }


      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve({
            src: e.target.result as string, // Store original Data URI
            fileType: file.type, // Store original type
          });
        } else {
          console.error("Error reading file:", file.name, " - Event target result is null");
          toast({ title: "File Read Error", description: `Could not read file ${file.name}.`, variant: "destructive" });
          resolve(null);
        }
      };
      reader.onerror = (error) => {
        console.error("Error reading file:", file.name, error);
        toast({ title: "File Read Error", description: `Could not read file ${file.name}.`, variant: "destructive" });
        resolve(null);
      };
      reader.readAsDataURL(file);
    });
  };

  // Handles the actual file selection event (No changes needed here)
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      directUploadIndexRef.current = null;
      return;
    }
    const targetIndex = directUploadIndexRef.current;
    directUploadIndexRef.current = null;
    let filesToProcess: File[] = Array.from(files);
    processFilesAndUpdateState(filesToProcess, targetIndex);
  };

  // Separated async logic for processing files and updating state (No changes needed here)
  const processFilesAndUpdateState = async (files: File[], targetSlotIndex: number | null) => {
    let filesAddedCount = 0;
    let pagesNeedUpdate = false;

    const readPromises = files.map(file => readFileAsDataURL(file));
    const imageDatas = (await Promise.all(readPromises)).filter(data => data !== null) as Omit<ImageItem, 'id' | 'label'>[];

    if (imageDatas.length === 0 && files.length > 0) {
      toast({ title: "Upload Failed", description: "No valid images could be processed.", variant: "destructive" });
      return;
    }
    if (imageDatas.length < files.length) {
      toast({ title: "Partial Upload", description: `${files.length - imageDatas.length} file(s) were skipped due to errors or unsupported types.`, variant: "default" });
    }

    setPages(currentPages => {
      let newPages = JSON.parse(JSON.stringify(currentPages));
      let currentImageIndex = 0;

      if (targetSlotIndex !== null && imageDatas.length > 0) {
        if (targetSlotIndex < newPages[currentPageIndex]?.items.length) {
          if (newPages[currentPageIndex].items[targetSlotIndex] === null) {
            const imageData = imageDatas[0];
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
            currentImageIndex = 1;
          } else {
            toast({ title: "Slot Filled", description: "The selected slot is already occupied.", variant: "destructive" });
          }
        } else {
          toast({ title: "Error", description: "Invalid target slot specified.", variant: "destructive" });
        }
      }

      for (let p = 0; p < newPages.length && currentImageIndex < imageDatas.length; p++) {
        const startingItemIndex = 0;
        for (let i = startingItemIndex; i < newPages[p].items.length && currentImageIndex < imageDatas.length; i++) {
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

      while (currentImageIndex < imageDatas.length) {
        const newPage: Page = {
          id: crypto.randomUUID(),
          items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null),
          rows: DEFAULT_ROWS,
          cols: DEFAULT_COLS,
          orientation: DEFAULT_ORIENTATION, // Still set, but not used for PDF export orientation
        };
        newPages.push(newPage);
        pagesNeedUpdate = true;
        const newPageIndex = newPages.length - 1;
        for (let i = 0; i < newPage.items.length && currentImageIndex < imageDatas.length; i++) {
          const imageData = imageDatas[currentImageIndex];
          newPages[newPageIndex].items[i] = {
            id: crypto.randomUUID(),
            src: imageData.src,
            label: '',
            fileType: imageData.fileType,
          };
          filesAddedCount++;
          currentImageIndex++;
        }
      }

      if (pagesNeedUpdate) {
        if (filesAddedCount > 0) {
          toast({ title: "Upload Successful", description: `${filesAddedCount} image(s) added.` });
        }
        return newPages;
      } else {
        if (files.length > 0 && targetSlotIndex !== null && filesAddedCount === 0 && imageDatas.length > 0) {
          // Slot filled toast already shown
        } else if (files.length > 0 && filesAddedCount === 0 && imageDatas.length === 0) {
          // Upload failed/partial toast already shown
        } else if (files.length > 0 && filesAddedCount === 0 && imageDatas.length > 0) {
          toast({ title: "Upload Info", description: "No empty slots found for the remaining images.", variant: "default" });
        }
        return currentPages;
      }
    });
  };

  // --- Other handlers (handleLabelChange, handleGridChange, handleDeleteImage, addPage, deletePage, goToNextPage, goToPrevPage) remain unchanged ---
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
      orientation: DEFAULT_ORIENTATION, // Still set, but not used for PDF export orientation
    };
    setPages(prevPages => [...prevPages, newPage]);
    setCurrentPageIndex(pages.length); // Navigate to the new page
    toast({
      title: "Page Added",
      description: `Page ${pages.length + 1} has been created.`,
    });
  };

  const deletePage = (pageIndexToDelete: number) => {
    if (pages.length <= 1) {
      toast({ title: "Cannot Delete", description: "You must have at least one page.", variant: "destructive" });
      return;
    }
    const deletedPageNum = pageIndexToDelete + 1;
    setPages(prevPages => prevPages.filter((_, index) => index !== pageIndexToDelete));
    setCurrentPageIndex(prevIndex => {
      if (prevIndex === pageIndexToDelete) {
        return Math.max(0, prevIndex - 1);
      } else if (prevIndex > pageIndexToDelete) {
        return prevIndex - 1;
      }
      return prevIndex;
    });
    toast({ title: "Page Deleted", description: `Page ${deletedPageNum} has been deleted.`, variant: "destructive" });
  };

  const goToNextPage = () => {
    setCurrentPageIndex(prevIndex => Math.min(prevIndex + 1, pages.length - 1));
  };

  const goToPrevPage = () => {
    setCurrentPageIndex(prevIndex => Math.max(0, prevIndex - 1));
  };

  // --- REMOVE handleOrientationChange ---
  // This function is no longer needed as the UI updates the global state directly
  // const handleOrientationChange = (newOrientation: 'p' | 'l') => {
  //   setPages(prevPages => prevPages.map((page, index) => {
  //     if (index === currentPageIndex) {
  //       return { ...page, orientation: newOrientation };
  //     }
  //     return page;
  //   }));
  //   toast({
  //     title: "Orientation Changed",
  //     description: `Page ${currentPageIndex + 1} set to ${newOrientation === 'p' ? 'Portrait' : 'Landscape'}.`,
  //   });
  // };
  // --- END REMOVE ---

  useEffect(() => {
    if (pages.length === 0) {
      setPages([{ id: crypto.randomUUID(), items: Array(DEFAULT_ROWS * DEFAULT_COLS).fill(null), rows: DEFAULT_ROWS, cols: DEFAULT_COLS, orientation: DEFAULT_ORIENTATION }]);
      setCurrentPageIndex(0);
    } else if (currentPageIndex >= pages.length) {
      setCurrentPageIndex(pages.length - 1);
    }
  }, [pages, currentPageIndex]);

  // *** HELPER FUNCTION for Image Conversion ***
  const convertImageToPNG = (src: string, originalType: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      console.log(`Converting image from ${originalType} to PNG...`);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context'));
        }
        ctx.drawImage(img, 0, 0);
        try {
          const pngDataUrl = canvas.toDataURL('image/png');
          console.log(`Conversion successful. PNG Data URL length: ${pngDataUrl.length}`);
          resolve(pngDataUrl);
        } catch (e) {
          console.error("Canvas toDataURL error:", e);
          // Attempt JPEG fallback if PNG fails (e.g., huge canvas)
          try {
            console.log("Attempting JPEG fallback conversion...");
            const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.9); // Quality 0.9
            console.log(`JPEG Fallback successful. JPEG Data URL length: ${jpegDataUrl.length}`);
            resolve(jpegDataUrl); // Resolve with JPEG if PNG failed
          } catch (e2) {
            console.error("Canvas toDataURL error (JPEG fallback):", e2);
            reject(new Error(`Failed to convert image to PNG or JPEG: ${e?.message || e}`));
          }
        }
      };
      img.onerror = (err) => {
        console.error("Error loading image for conversion:", err);
        reject(new Error(`Failed to load image (${originalType}) for conversion`));
      };
      img.src = src; // The original Data URI
    });
  };


  const exportToPDF = useCallback(async () => {
    if (isLoadingPDF) return;
    setIsLoadingPDF(true);
    toast({ title: 'Generating PDF...', description: 'Please wait, conversion might take time for some images.' });

    if (!pages || pages.length === 0) {
      toast({ title: 'No Pages', description: 'Add some pages before exporting.', variant: 'default' });
      setIsLoadingPDF(false);
      return;
    }

    // --- Initialize jsPDF using the GLOBAL pageSize and GLOBAL orientation state ---
    const pdf = new jsPDF({
        orientation: pageOrientation, // Use the global pageOrientation state
        unit: 'pt',
        format: pageSize // Use the global pageSize state
    });
    // --- End jsPDF Initialization ---


    // --- Font Handling ---
    let fontLoaded = false;
    const FONT_NAME = 'NotoSansSC'; // Use the correct name for your CJK font
    const FONT_FILENAME_VFS = 'NotoSansSC-Regular-normal.ttf'; // Match addFont
    const FONT_STYLE = 'normal';
    try {
      // @ts-ignore
      if (typeof NotoSansSC_Regular !== 'undefined' && NotoSansSC_Regular) {
        pdf.addFileToVFS(FONT_FILENAME_VFS, NotoSansSC_Regular);
        pdf.addFont(FONT_FILENAME_VFS, FONT_NAME, FONT_STYLE);
        pdf.setFont(FONT_NAME, FONT_STYLE);
        console.log(`Using ${FONT_NAME} font for PDF.`);
        fontLoaded = true;
      } else { /* ... fallback ... */
        console.log("Custom font not loaded, using Helvetica.");
        pdf.setFont('Helvetica', 'normal');
        toast({ title: 'Font Warning', description: 'Default font used. Ensure CJK font is correctly set up for full character support.', variant: 'default' });
      }
    } catch (fontError) { /* ... error handling ... */
      console.error("Error loading/setting PDF font:", fontError);
      toast({ title: 'Font Error', description: 'Could not set custom font, using default.', variant: 'destructive' });
      pdf.setFont('Helvetica', 'normal');
    }
    const labelFontSize = 10;
    pdf.setFontSize(labelFontSize);
    // --- End Font Handling ---

    const pageMargin = 40;
    // --- Calculate usable dimensions based on the PDF's initialized size/orientation ---
    const usableWidth = pdf.internal.pageSize.getWidth() - 2 * pageMargin;
    const usableHeight = pdf.internal.pageSize.getHeight() - 2 * pageMargin;
    const labelAreaHeight = 30;

    try {
      for (let p = 0; p < pages.length; p++) {
        const pageData = pages[p];
        const { rows, cols, items } = pageData; // Use rows/cols from pageData

        if (p > 0) {
            // Add page using the document's default format and orientation
            pdf.addPage();
        }

        if (fontLoaded) pdf.setFont(FONT_NAME, FONT_STYLE);
        else pdf.setFont('Helvetica', 'normal');

        // Page Number Header
        pdf.setFontSize(9); pdf.setTextColor(150);
        // Use pdf.internal.pageSize.getWidth() which reflects the current page's width
        pdf.text(`Page ${p + 1} of ${pages.length}`, pdf.internal.pageSize.getWidth() - pageMargin, pageMargin / 2, { align: 'right' });
        pdf.setTextColor(0); pdf.setFontSize(labelFontSize);

        const totalItemsOnPage = items.filter(item => item !== null).length;
        if (totalItemsOnPage === 0) {
          pdf.setFontSize(12);
          pdf.text(`Page ${p + 1} is empty`, pageMargin, pageMargin + 20);
          pdf.setFontSize(labelFontSize);
          continue;
        }

        // Calculate cell dimensions based on the CURRENT page's rows/cols and usable dimensions
        const cellWidth = usableWidth / cols;
        const cellHeight = usableHeight / rows;
        const availableCellHeight = cellHeight - 5;

        if (cellWidth <= 10 || availableCellHeight <= labelAreaHeight + 10) {
          console.error(`Layout issue on page ${p + 1}: Cell dimensions too small.`);
          toast({ title: 'Layout Error', description: `Cannot render page ${p + 1}. Try fewer rows/columns.`, variant: 'destructive' });
          continue;
        }

        const imgPadding = 5;
        const imgMaxWidth = cellWidth - (2 * imgPadding);
        const imgMaxHeight = availableCellHeight - labelAreaHeight - imgPadding;

        if (imgMaxHeight <= 0) {
          console.error(`Calculated negative/zero image max height on page ${p + 1}.`);
          toast({ title: 'Layout Error', description: `Cannot render page ${p + 1} (img height <= 0). Try fewer rows.`, variant: 'destructive' });
          continue;
        }

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item) continue;

          const rowIndex = Math.floor(i / cols);
          const colIndex = i % cols;
          const cellX = pageMargin + colIndex * cellWidth;
          const cellY = pageMargin + rowIndex * cellHeight;

          try {
            let imageDataForPdf = item.src;
            let imageFormatForPdf = 'JPEG';

            if (PDF_DIRECT_SUPPORTED_TYPES.includes(item.fileType)) {
              if (item.fileType.includes('png')) imageFormatForPdf = 'PNG';
              else if (item.fileType.includes('webp')) imageFormatForPdf = 'WEBP';
              else imageFormatForPdf = 'JPEG';
            } else if (IMAGE_TYPES_TO_CONVERT.includes(item.fileType)) {
              try {
                const convertedDataUrl = await convertImageToPNG(item.src, item.fileType);
                imageDataForPdf = convertedDataUrl;
                if (convertedDataUrl.startsWith('data:image/jpeg')) {
                  imageFormatForPdf = 'JPEG';
                } else {
                  imageFormatForPdf = 'PNG';
                }
              } catch (conversionError) {
                console.error(`Failed to convert ${item.fileType} image ${item.id}:`, conversionError);
                toast({ title: 'Image Conversion Failed', description: `Could not convert image ${i + 1} (${item.fileType}) for PDF. Skipping.`, variant: 'destructive' });
                continue;
              }
            } else {
              console.warn(`Unexpected file type encountered during PDF export: ${item.fileType}. Skipping image ${item.id}.`);
              toast({ title: 'Unexpected Image Type', description: `Skipping image ${i + 1} due to unexpected type: ${item.fileType}.`, variant: 'warning' });
              continue;
            }

            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = (err) => reject(new Error(`Failed to load image data for PDF: ${item.id} (Type: ${imageFormatForPdf})`));
              image.src = imageDataForPdf;
            });

            const imgWidth = img.naturalWidth;
            const imgHeight = img.naturalHeight;
            if (imgWidth === 0 || imgHeight === 0) throw new Error(`Image has zero dimensions after load/conversion: ${item.id}`);

            const aspectRatio = imgWidth / imgHeight;
            let drawWidth = imgMaxWidth;
            let drawHeight = drawWidth / aspectRatio;

            if (drawHeight > imgMaxHeight) {
              drawHeight = imgMaxHeight;
              drawWidth = drawHeight * aspectRatio;
            }
            if (drawWidth > imgMaxWidth) {
              drawWidth = imgMaxWidth;
              drawHeight = drawWidth / aspectRatio;
            }

            const drawX = cellX + (cellWidth - drawWidth) / 2;
            const drawY = cellY + imgPadding;

            if (fontLoaded) pdf.setFont(FONT_NAME, FONT_STYLE); else pdf.setFont('Helvetica', 'normal');
            pdf.setFontSize(labelFontSize);

            pdf.addImage(imageDataForPdf, imageFormatForPdf, drawX, drawY, drawWidth, drawHeight);

            if (item.label) {
              const labelX = cellX + cellWidth / 2;
              const labelY = drawY + drawHeight + 5;
              const labelMaxWidth = cellWidth - (2 * imgPadding);

              if (fontLoaded) pdf.setFont(FONT_NAME, FONT_STYLE); else pdf.setFont('Helvetica', 'normal');
              pdf.setFontSize(labelFontSize);

              const labelLines = pdf.splitTextToSize(item.label, labelMaxWidth);
              pdf.text(labelLines, labelX, labelY, { align: 'center', maxWidth: labelMaxWidth, baseline: 'top' });
            }

          } catch (imgOrPdfError) {
            console.error(`Error processing image ${item.id} for PDF:`, imgOrPdfError);
            const errorX = cellX + 5;
            const errorY = cellY + 20;
            if (fontLoaded) pdf.setFont(FONT_NAME, FONT_STYLE); else pdf.setFont('Helvetica', 'normal');
            pdf.setFontSize(8); pdf.setTextColor(255, 0, 0);
            pdf.text(`Error image ${i + 1}`, errorX, errorY, { maxWidth: cellWidth - 10 });
            pdf.setTextColor(0); pdf.setFontSize(labelFontSize);
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
  }, [pages, pageSize, pageOrientation, toast, isLoadingPDF]); // <-- Ensure pageOrientation is in dependencies


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
        <Card className="w-full md:w-1/4 h-fit top-4 shadow-md">
          <CardHeader> <CardTitle>Controls</CardTitle> </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload img */}
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
                accept={ACCEPT_STRING}
                className="hidden"
              />
            </div>
            <Separator />
            {/* Page Size (Global) */}
            <div>
              <Label htmlFor="page-size-select" className="mb-2 block">PDF Page Size</Label>
              <Select value={pageSize} onValueChange={setPageSize}>
                <SelectTrigger id="page-size-select" className="w-full">
                  <SelectValue placeholder="Select Page Size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4</SelectItem>
                  <SelectItem value="a3">A3</SelectItem>
                  <SelectItem value="a5">A5</SelectItem>
                  <SelectItem value="b5">B5</SelectItem>
                  <SelectItem value="letter">Letter</SelectItem>
                  <SelectItem value="legal">Legal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Page Orientation (Global) */}
            <div>
              <Label htmlFor="page-orientation-select" className="mb-2 block">PDF Orientation</Label> {/* Changed label and id */}
              <Select value={pageOrientation} onValueChange={setPageOrientation}>
                <SelectTrigger id="page-orientation-select" className="w-full"> {/* Changed id */}
                  <SelectValue placeholder="Select Orientation" /> {/* Changed placeholder */}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="p">Portrait</SelectItem>
                  <SelectItem value="l">Landscape</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div>
              <Label className="mb-2 block">Grid Layout (Page {currentPageIndex + 1})</Label>
              <div className="flex gap-2">
                <Select onValueChange={(value) => handleGridChange('rows', value)} value={String(currentPage?.rows ?? DEFAULT_ROWS)}>
                  <SelectTrigger className="w-full"> <SelectValue placeholder="Rows" /> </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <SelectItem key={`row-${n}`} value={String(n)}>{n} Rows</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select onValueChange={(value) => handleGridChange('cols', value)} value={String(currentPage?.cols ?? DEFAULT_COLS)}>
                  <SelectTrigger className="w-full"> <SelectValue placeholder="Cols" /> </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6].map(n => <SelectItem key={`col-${n}`} value={String(n)}>{n} Cols</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Separator />
            <div className="flex flex-row md:flex-col gap-2">
              <Button onClick={addPage} className="w-full" variant="outline"> <PlusCircle className="mr-2 h-4 w-4" /> Add Page </Button>
              <Button onClick={() => deletePage(currentPageIndex)} className="w-full" variant="destructive" disabled={pages.length <= 1}> <Trash2 className="mr-2 h-4 w-4" /> Delete Page </Button>
            </div>
            <Separator />
            <Button onClick={exportToPDF} className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={isLoadingPDF || pages.length === 0 || pages.every(p => p.items.every(item => item === null))}>
              {isLoadingPDF ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export as PDF
            </Button>
          </CardContent>
        </Card>

        {/* Grid Display Area */}
        <main className="flex-grow flex flex-col">
          <Card className="flex-grow shadow-md">
            <CardHeader className="flex flex-row justify-between items-center border-b pb-4">
              <CardTitle>Page {currentPageIndex + 1} of {pages.length}</CardTitle>
              <div className="flex gap-2 items-center"> {/* Wrap controls */}
                {/* REMOVED Per-Page Orientation Selector */}
                {/* Page Navigation */}
                <Button onClick={goToPrevPage} disabled={currentPageIndex === 0} size="icon" variant="outline"> <ArrowLeft className="h-4 w-4" /> <span className="sr-only">Prev</span> </Button>
                <Button onClick={goToNextPage} disabled={currentPageIndex >= pages.length - 1} size="icon" variant="outline"> <ArrowRight className="h-4 w-4" /> <span className="sr-only">Next</span> </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {currentPage && (
                <div
                  className={`grid gap-4 border border-dashed border-border p-4 rounded-md bg-muted/10`}
                  style={{ gridTemplateColumns: `repeat(${currentPage.cols}, minmax(100px, 1fr))`, gridAutoRows: `minmax(150px, auto)` }}
                >
                  {Array.from({ length: currentPage.rows * currentPage.cols }).map((_, index) => {
                    const item = currentPage.items[index] ?? null;
                    return (
                      <div key={item?.id ?? `empty-slot-${currentPage.id}-${index}`} className="border rounded-md flex flex-col items-center p-2 relative group bg-card hover:shadow-lg transition-shadow overflow-hidden justify-between" style={{ minHeight: '150px' }}>
                        {item ? (
                          <>
                            {/* Image container - uses original src for display */}
                            <div className="w-full flex-shrink-0 flex items-center justify-center overflow-hidden mb-1 flex-grow relative" style={{ minHeight: '50px' }}>
                              <img src={item.src} alt={`Grid image ${index + 1}`} className="max-w-full max-h-full object-contain rounded absolute top-0 left-0 right-0 bottom-0 m-auto" />
                            </div>
                            {/* Label Container */}
                            <div className="w-full mt-auto flex-shrink-0 h-[40px]">
                              <Textarea value={item.label} onChange={(e) => handleLabelChange(item.id, e.target.value)} placeholder="Add label..." className="w-full text-xs resize-none p-1 text-foreground bg-background border-input focus:ring-ring text-center block h-full" rows={2} />
                            </div>
                            <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded-full p-1 z-10" onClick={() => handleDeleteImage(item.id)} aria-label="Delete image">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <button className="w-full h-full flex flex-col items-center justify-center text-center text-muted-foreground hover:bg-accent/10 transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" onClick={() => triggerFileUpload(index)} aria-label={`Add image to slot ${index + 1}`}>
                            <ImagePlus className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                            <span className="text-sm">Click to add</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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