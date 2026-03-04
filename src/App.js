import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';

function App() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [, setGridType] = useState(null);
  const [manualGridType, setManualGridType] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState([]);
  const [imageOffsets, setImageOffsets] = useState([]);
  const fileInputRef = useRef(null);

  // Constants for Instagram grid dimensions
  const TARGET_WIDTH = 1010;
  const TARGET_HEIGHT = 1350;
  const FINAL_WIDTH = 1080; // 1010 + 35px padding on each side
  const FINAL_HEIGHT = 1350;

  const handleFileSelect = useCallback((files) => {
    const imageFiles = Array.from(files).filter(file =>
      file.type.startsWith('image/')
    );

    if (imageFiles.length === 0) {
      setStatus('Please select valid image files.');
      return;
    }

    setSelectedFiles(imageFiles);
    setImageOffsets(Array(imageFiles.length).fill({ x: 0, y: 0 }));
    setStatus(`Selected ${imageFiles.length} image(s)`);
    setGridType(null);
    setManualGridType(null);
    setShowPreview(false);
    setPreviewImages([]);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleFileInputChange = useCallback((e) => {
    const files = e.target.files;
    handleFileSelect(files);
  }, [handleFileSelect]);

  const determineOptimalGrid = useCallback((imageWidth, imageHeight) => {
    // Calculate aspect ratios for all grid types
    const aspectRatio = imageWidth / imageHeight;

    // 1x3 grid: 3 * 1010 x 1 * 1350 = 3030 x 1350
    const grid1x3Ratio = 3030 / 1350; // 2.244

    // 2x3 grid: 3 * 1010 x 2 * 1350 = 3030 x 2700
    const grid2x3Ratio = 3030 / 2700; // 1.122

    // 3x3 grid: 3 * 1010 x 3 * 1350 = 3030 x 4050
    const grid3x3Ratio = 3030 / 4050; // 0.748

    // Calculate which grid type has less whitespace
    const diff1x3 = Math.abs(aspectRatio - grid1x3Ratio);
    const diff2x3 = Math.abs(aspectRatio - grid2x3Ratio);
    const diff3x3 = Math.abs(aspectRatio - grid3x3Ratio);

    if (diff1x3 < diff2x3 && diff1x3 < diff3x3) return '1x3';
    if (diff2x3 < diff3x3) return '2x3';
    return '3x3';
  }, []);

  const createCanvas = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };

  const getGridDimensions = (gridType) => {
    switch (gridType) {
      case '1x3': return { cols: 3, rows: 1 };
      case '2x3': return { cols: 3, rows: 2 };
      case '3x3': return { cols: 3, rows: 3 };
      default: return { cols: 3, rows: 2 };
    }
  };

  const createGridPreview = useCallback(async (file, gridType, imageOffsetX, imageOffsetY) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const { cols, rows } = getGridDimensions(gridType);

        // Calculate target grid dimensions
        const targetGridWidth = cols * TARGET_WIDTH;
        const targetGridHeight = rows * TARGET_HEIGHT;

        // Calculate scaling to fit the image into the grid
        const scaleX = targetGridWidth / img.width;
        const scaleY = targetGridHeight / img.height;
        const scale = Math.max(scaleX, scaleY); // Use the larger scale to ensure coverage

        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;

        // Calculate offset to center the image (same as processImage)
        const offsetX = (scaledWidth - targetGridWidth) / 2;
        const offsetY = (scaledHeight - targetGridHeight) / 2;

        // Create a preview canvas showing the realistic grid overlay
        const previewCanvas = document.createElement('canvas');
        const previewCtx = previewCanvas.getContext('2d');

        // Set preview size (max 600px width for display)
        const maxPreviewWidth = 600;
        const previewScale = Math.min(maxPreviewWidth / targetGridWidth, maxPreviewWidth / targetGridHeight);
        const previewWidth = targetGridWidth * previewScale;
        const previewHeight = targetGridHeight * previewScale;

        previewCanvas.width = previewWidth;
        previewCanvas.height = previewHeight;

        // Fill with white background to show whitespace
        previewCtx.fillStyle = 'white';
        previewCtx.fillRect(0, 0, previewWidth, previewHeight);

        // Calculate grid cell size
        const cellWidth = previewWidth / cols;
        const cellHeight = previewHeight / rows;

        // Draw each grid piece onto the preview canvas
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            // Calculate source coordinates from the original image
            const sourceX = (col * TARGET_WIDTH + offsetX + imageOffsetX) / scale;
            const sourceY = (row * TARGET_HEIGHT + offsetY + imageOffsetY) / scale;
            const sourceWidth = TARGET_WIDTH / scale;
            const sourceHeight = TARGET_HEIGHT / scale;

            // Calculate destination coordinates on the preview canvas
            // Adjust for padding to match the exported images
            const dx = col * cellWidth + (35 * previewScale);
            const dy = row * cellHeight;
            const dWidth = TARGET_WIDTH * previewScale;
            const dHeight = TARGET_HEIGHT * previewScale;

            // Draw the portion of the image for this cell
            previewCtx.drawImage(
              img,
              sourceX, sourceY, sourceWidth, sourceHeight,
              dx, dy, dWidth, dHeight
            );
          }
        }

        // Draw grid lines
        previewCtx.strokeStyle = '#667eea';
        previewCtx.lineWidth = 2;

        // Vertical lines
        for (let i = 1; i < cols; i++) {
          previewCtx.beginPath();
          previewCtx.moveTo(i * cellWidth, 0);
          previewCtx.lineTo(i * cellWidth, previewHeight);
          previewCtx.stroke();
        }

        // Horizontal lines
        for (let i = 1; i < rows; i++) {
          previewCtx.beginPath();
          previewCtx.moveTo(0, i * cellHeight);
          previewCtx.lineTo(previewWidth, i * cellHeight);
          previewCtx.stroke();
        }

        // Add cell numbers
        previewCtx.fillStyle = '#667eea';
        previewCtx.font = 'bold 16px Arial';
        previewCtx.textAlign = 'center';
        previewCtx.textBaseline = 'middle';

        let cellNumber = 1;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const x = col * cellWidth + cellWidth / 2;
            const y = row * cellHeight + cellHeight / 2;

            // Add background for number visibility
            previewCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            previewCtx.fillRect(x - 15, y - 10, 30, 20);

            // Add number
            previewCtx.fillStyle = '#667eea';
            previewCtx.fillText(cellNumber.toString(), x, y);
            cellNumber++;
          }
        }

        // Convert to blob
        previewCanvas.toBlob((blob) => {
          resolve({
            blob,
            gridType,
            cols,
            rows,
            totalCells: cols * rows
          });
        }, 'image/jpeg', 0.9);
      };

      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const processImage = async (file, selectedGridType, imageOffsetX, imageOffsetY) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const gridType = selectedGridType || determineOptimalGrid(img.width, img.height);
        const { cols, rows } = getGridDimensions(gridType);

        const splitImagePromises = []; // Array to hold promises for each split image

        // Calculate target grid dimensions
        const targetGridWidth = cols * TARGET_WIDTH;
        const targetGridHeight = rows * TARGET_HEIGHT;

        // Calculate scaling to fit the image into the grid
        const scaleX = targetGridWidth / img.width;
        const scaleY = targetGridHeight / img.height;
        const scale = Math.max(scaleX, scaleY); // Use the larger scale to ensure coverage

        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;

        // Calculate offset to center the image
        const offsetX = (scaledWidth - targetGridWidth) / 2;
        const offsetY = (scaledHeight - targetGridHeight) / 2;

        // Create each grid piece
        let cellNumber = 1;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const canvas = createCanvas(FINAL_WIDTH, FINAL_HEIGHT);
            const ctx = canvas.getContext('2d');

            // Fill with white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, FINAL_WIDTH, FINAL_HEIGHT);

            // Calculate source coordinates
            const sourceX = (col * TARGET_WIDTH + offsetX + imageOffsetX) / scale;
            const sourceY = (row * TARGET_HEIGHT + offsetY + imageOffsetY) / scale;
            const sourceWidth = TARGET_WIDTH / scale;
            const sourceHeight = TARGET_HEIGHT / scale;

            // Draw the image portion (with 35px padding on left and right)
            ctx.drawImage(
              img,
              sourceX, sourceY, sourceWidth, sourceHeight,
              35, 0, TARGET_WIDTH, TARGET_HEIGHT
            );

            // Capture the current cellNumber for this iteration
            const currentCellNumber = cellNumber;

            // Create a promise for each toBlob call
            const p = new Promise((blobResolve) => {
              canvas.toBlob((blob) => {
                blobResolve({
                  blob,
                  filename: `${file.name.replace(/\.[^/.]+$/, '')}_${currentCellNumber}.jpg`
                });
              }, 'image/jpeg', 0.9);
            });
            splitImagePromises.push(p);

            cellNumber++;
          }
        }

        // Wait for all split image blobs to be generated
        Promise.all(splitImagePromises)
          .then(splitImages => {
            resolve({ splitImages, gridType });
          })
          .catch(reject); // Propagate any errors from toBlob

      };

      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const generatePreviews = useCallback(async () => {
    if (selectedFiles.length === 0) {
      setStatus('Please select images first.');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setStatus('Generating previews...');

    try {
      const previews = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setStatus(`Generating preview for ${file.name}...`);

        // Get image dimensions first
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });

        const selectedGrid = manualGridType || determineOptimalGrid(img.width, img.height);
        const preview = await createGridPreview(file, selectedGrid, imageOffsets[i].x, imageOffsets[i].y);

        previews.push({
          ...preview,
          originalFile: file,
          filename: file.name
        });

        setProgress(((i + 1) / selectedFiles.length) * 100);
      }

      setPreviewImages(previews);
      setShowPreview(true);
      setStatus('Previews generated! Review and confirm to export.');

    } catch (error) {
      console.error('Error generating previews:', error);
      setStatus('Error generating previews. Please try again.');
    }

    finally {
      setProcessing(false);
    }
  }, [selectedFiles, manualGridType, imageOffsets, createGridPreview, determineOptimalGrid]);

  const processAllImages = async () => {
    if (selectedFiles.length === 0) {
      setStatus('Please select images first.');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setStatus('Processing images...');

    try {
      const zip = new JSZip();
      let totalProcessed = 0;
      let overallGridType = null;

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setStatus(`Processing ${file.name}...`);

        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });

        const selectedGrid = manualGridType || determineOptimalGrid(img.width, img.height);
        const { splitImages, gridType } = await processImage(file, selectedGrid, imageOffsets[i].x, imageOffsets[i].y);

        if (overallGridType === null) {
          overallGridType = gridType;
          setGridType(gridType);
        }

        // Add images to zip
        splitImages.forEach(({ blob, filename }) => {
          zip.file(filename, blob);
        });

        totalProcessed++;
        setProgress((totalProcessed / selectedFiles.length) * 100);
      }

      setStatus('Creating zip file...');

      // Generate zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      // Download the zip file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      saveAs(zipBlob, `instagrid_${overallGridType}_${timestamp}.zip`);

      setStatus('Success! Your Instagram grid photos have been downloaded.');
      setProgress(100);

    } catch (error) {
      console.error('Error processing images:', error);
      setStatus('Error processing images. Please try again.');
    }

    finally {
      setProcessing(false);
    }
  };

  const clearFiles = () => {
    setSelectedFiles([]);
    setStatus('');
    setProgress(0);
    setGridType(null);
    setManualGridType(null);
    setShowPreview(false);
    setPreviewImages([]);
    setImageOffsets([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGridTypeChange = (newGridType) => {
    setManualGridType(newGridType);
    setShowPreview(false);
    setPreviewImages([]);
  };

  const handleOffsetChange = useCallback((index, axis, delta) => {
    setImageOffsets(prevOffsets => {
      const newOffsets = [...prevOffsets];
      newOffsets[index] = {
        ...newOffsets[index],
        [axis]: (newOffsets[index]?.[axis] || 0) + delta,
      };
      return newOffsets;
    });
  }, []);

  useEffect(() => {
    if (showPreview) {
      generatePreviews();
    }
  }, [imageOffsets, showPreview, generatePreviews]);

  return (
    <div className="container">
      <h1 className="title">InstaGrid Creator</h1>
      <p className="subtitle">Automatically split images into seamless Instagram grid layouts</p>

      <div className="card">
        <div
          className={`upload-area ${processing ? 'disabled' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => !processing && fileInputRef.current?.click()}
        >
          <div className="upload-icon">📸</div>
          <div className="upload-text">
            {selectedFiles.length > 0
              ? `${selectedFiles.length} image(s) selected`
              : 'Drop images here or click to select'
            }
          </div>
          <div className="upload-hint">
            Supports JPG, PNG, GIF, and other image formats
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileInputChange}
          className="file-input"
          disabled={processing}
        />

        {selectedFiles.length > 0 && (
          <>
            <div className="preview-container">
              {selectedFiles.map((file, index) => (
                <div key={index} className="preview-item">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="preview-image"
                  />
                  <div className="preview-info">
                    <div>{file.name}</div>
                    <div>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid-selection">
              <h3>Choose Grid Format</h3>
              <div className="grid-options">
                <button
                  className={`grid-option ${manualGridType === '1x3' ? 'selected' : ''}`}
                  onClick={() => handleGridTypeChange('1x3')}
                  disabled={processing}
                >
                  <div className="grid-option-preview">
                    <div className="example-grid 1x3">
                      <div className="example-cell">1</div>
                      <div className="example-cell">2</div>
                      <div className="example-cell">3</div>
                    </div>
                  </div>
                  <div className="grid-option-label">1×3 Grid (3 pieces)</div>
                </button>

                <button
                  className={`grid-option ${manualGridType === '2x3' ? 'selected' : ''}`}
                  onClick={() => handleGridTypeChange('2x3')}
                  disabled={processing}
                >
                  <div className="grid-option-preview">
                    <div className="example-grid 2x3">
                      <div className="example-cell">1</div>
                      <div className="example-cell">2</div>
                      <div className="example-cell">3</div>
                      <div className="example-cell">4</div>
                      <div className="example-cell">5</div>
                      <div className="example-cell">6</div>
                    </div>
                  </div>
                  <div className="grid-option-label">2×3 Grid (6 pieces)</div>
                </button>

                <button
                  className={`grid-option ${manualGridType === '3x3' ? 'selected' : ''}`}
                  onClick={() => handleGridTypeChange('3x3')}
                  disabled={processing}
                >
                  <div className="grid-option-preview">
                    <div className="example-grid 3x3">
                      <div className="example-cell">1</div>
                      <div className="example-cell">2</div>
                      <div className="example-cell">3</div>
                      <div className="example-cell">4</div>
                      <div className="example-cell">5</div>
                      <div className="example-cell">6</div>
                      <div className="example-cell">7</div>
                      <div className="example-cell">8</div>
                      <div className="example-cell">9</div>
                    </div>
                  </div>
                  <div className="grid-option-label">3×3 Grid (9 pieces)</div>
                </button>
              </div>
            </div>
          </>
          )}

        {status && (
          <div className={`status ${status.includes('Error') ? 'error' : status.includes('Success') ? 'success' : 'info'}`}>
            {status}
          </div>
        )}

        {processing && (
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          {selectedFiles.length > 0 && (
            <>
              <button
                className="button"
                onClick={generatePreviews}
                disabled={processing || !manualGridType}
              >
                {processing ? 'Generating...' : 'Preview Grid Layout'}
              </button>
              <button
                className="button secondary"
                onClick={clearFiles}
                disabled={processing}
              >
                Clear Files
              </button>
            </>
          )}
        </div>
      </div>

      {showPreview && previewImages.length > 0 && (
        <div className="card">
          <h2>Grid Preview</h2>
          <p>Review how your images will be split. Each numbered section will become a separate Instagram post.</p>

          <div className="preview-grid-container">
            {previewImages.map((preview, index) => (
              <div key={index} className="preview-grid-item">
                <h4>{preview.filename}</h4>
                <div className="preview-grid-image">
                  <img
                    src={URL.createObjectURL(preview.blob)}
                    alt={`Grid preview for ${preview.filename}`}
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>
                <div className="preview-grid-info">
                  <div>Grid: {preview.gridType}</div>
                  <div>Pieces: {preview.totalCells}</div>
                  <div>Final size: {FINAL_WIDTH}×{FINAL_HEIGHT}px each</div>
                </div>
                <div className="offset-controls">
                  <button onClick={() => handleOffsetChange(index, 'y', -10)} disabled={processing}>⬆️ Up</button>
                  <button onClick={() => handleOffsetChange(index, 'y', 10)} disabled={processing}>⬇️ Down</button>
                  <button onClick={() => handleOffsetChange(index, 'x', -10)} disabled={processing}>⬅️ Left</button>
                  <button onClick={() => handleOffsetChange(index, 'x', 10)} disabled={processing}>➡️ Right</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: '30px' }}>
            <button
              className="button"
              onClick={processAllImages}
              disabled={processing}
            >
              {processing ? 'Processing...' : 'Export Grid Photos'}
            </button>
            <button
              className="button secondary"
              onClick={() => setShowPreview(false)}
              disabled={processing}
            >
              Back to Edit
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>How it works</h2>
        <ul style={{ lineHeight: '1.8', marginTop: '15px' }}>
          <li><strong>Choose Grid Format:</strong> Select from 1×3, 2×3, or 3×3 grid layouts</li>
          <li><strong>Preview Layout:</strong> See exactly how your image will be split before processing</li>
          <li><strong>Perfect Fit:</strong> Scales and crops images to minimize whitespace in the final grid</li>
          <li><strong>Instagram Ready:</strong> Each piece is exactly 1080×1350px (Instagram's optimal size)</li>
          <li><strong>Easy Download:</strong> All pieces are packaged in a zip file for easy upload to Instagram</li>
        </ul>
      </div>
    </div>
  );
}

export default App;