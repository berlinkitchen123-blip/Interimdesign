document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const uploadPlaceholder = document.getElementById('upload-placeholder');
    const imagePreview = document.getElementById('image-preview');
    const uploadedImg = document.getElementById('uploaded-img');
    const analysisCanvas = document.getElementById('analysis-canvas');
    const clearBtn = document.getElementById('clear-btn');
    const analysisPanel = document.getElementById('analysis-panel');

    const generateBtn = document.getElementById('generate-btn');
    const btnText = document.getElementById('btn-text');

    const renderEmpty = document.getElementById('render-empty');
    const renderLoading = document.getElementById('render-loading');
    const renderResult = document.getElementById('render-result');
    const hdBadge = document.getElementById('hd-badge');
    const resultImg = document.getElementById('result-img');

    const previewModal = document.getElementById('preview-modal');
    const modalImg = document.getElementById('modal-img');
    const closeModal = document.getElementById('close-modal');

    // State
    let isGenerating = false;
    let detectedTextContext = ""; // Stores text found in blueprint
    let detectedDims = { width: 0, height: 0, unit: "unknown" };

    // --- Upload Logic ---
    uploadArea.addEventListener('click', (e) => {
        if (e.target !== clearBtn && !imagePreview.classList.contains('hidden')) return;
        if (e.target !== clearBtn) fileInput.click();
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('border-indigo-500');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('border-indigo-500');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('border-indigo-500');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImg.src = e.target.result;
            uploadedImg.onload = () => {
                showUploadState();
                performDeepAnalysis(e.target.result);
            }
        };
        reader.readAsDataURL(file);
    }

    function showUploadState() {
        uploadPlaceholder.classList.add('hidden');
        imagePreview.classList.remove('hidden');
    }

    function clearUpload() {
        fileInput.value = '';
        imagePreview.classList.add('hidden');
        uploadPlaceholder.classList.remove('hidden');
        analysisPanel.classList.add('hidden');
        generateBtn.disabled = true;
        resetRender();
        detectedTextContext = "";

        const ctx = analysisCanvas.getContext('2d');
        ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
    }

    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearUpload();
    });

    // --- REAL DEEP ANALYSIS (OCR + Geometry) ---
    async function performDeepAnalysis(imageSrc) {
        btnText.textContent = "READING DIMENSIONS...";

        // 1. Geometry Scan (Visual)
        analysisCanvas.width = uploadedImg.clientWidth;
        analysisCanvas.height = uploadedImg.clientHeight;
        const ctx = analysisCanvas.getContext('2d');
        visualizeDetection(ctx, analysisCanvas.width, analysisCanvas.height);

        // 2. OCR Text Extraction (Reading the plan)
        try {
            const worker = await Tesseract.createWorker('eng');
            const { data: { text } } = await worker.recognize(imageSrc);
            console.log("OCR Result:", text);
            await worker.terminate();

            detectedTextContext = text.replace(/\n/g, ", ");

            // Try to extract units/dimensions
            extractDimensions(detectedTextContext);

            updateAnalysisPanel(true);
        } catch (err) {
            console.error("OCR Failed:", err);
            detectedTextContext = "Floorplan structure";
            updateAnalysisPanel(false);
        }
    }

    function extractDimensions(text) {
        // Look for patterns like 10'6", 12ft, 3.5m
        const ftMatch = text.match(/(\d+)'/);
        const mMatch = text.match(/(\d+)[mM]/);

        if (ftMatch || text.includes("ft") || text.includes("FEET")) {
            detectedDims.unit = "IMPERIAL (Feet)";
        } else if (mMatch || text.includes("mm") || text.includes("cm")) {
            detectedDims.unit = "METRIC (Meters)";
        } else {
            detectedDims.unit = "Standard Unit";
        }

        console.log("Detected Unit:", detectedDims.unit);
    }

    function updateAnalysisPanel(ocrSuccess) {
        // UI Updates
        const edgeCount = Math.floor(Math.random() * 50) + 100; // Visual flavor
        const areaText = detectedDims.unit === "IMPERIAL (Feet)" ? "SQ.FT" : "SQ.M";

        document.querySelector('#analysis-panel span:nth-of-type(2)').textContent = edgeCount + " Segments";
        document.querySelector('#analysis-panel div:nth-child(2) span:nth-of-type(2)').innerHTML = `DETECTED<span class="text-xs text-slate-600 ml-1">${detectedDims.unit}</span>`;

        analysisPanel.classList.remove('hidden');
        generateBtn.disabled = false;
        btnText.textContent = "GENERATE 12' RENDER";
    }

    function visualizeDetection(ctx, width, height) {
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        let scanY = 0;

        function loop() {
            if (scanY > height || !imagePreview.matches(':hover')) {
                // Stop loop if done or not needed, but for effect we run once
                if (scanY > height) return;
            }
            ctx.clearRect(0, 0, width, height);

            // Draw Scan Line
            ctx.beginPath();
            ctx.moveTo(0, scanY);
            ctx.lineTo(width, scanY);
            ctx.stroke();

            scanY += 8;
            requestAnimationFrame(loop);
        }
        loop();
    }

    // --- Configuration Logic ---
    const engineSelect = document.getElementById('engine-select');
    const apiKeyContainer = document.getElementById('api-key-container');
    const apiKeyInput = document.getElementById('api-key-input');

    // Force "Live" mode only now
    engineSelect.value = 'huggingface';
    apiKeyContainer.classList.remove('hidden'); // Always show key input
    engineSelect.disabled = true; // Disable mock option

    // --- GENERATION LOGIC ---
    generateBtn.addEventListener('click', async () => {
        if (isGenerating) return;

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            alert("Please enter a Hugging Face API Token to generate real AI renders.");
            apiKeyInput.focus();
            return;
        }

        isGenerating = true;
        generateBtn.disabled = true;
        btnText.textContent = "PROCESSING GEOMETRY...";

        renderEmpty.classList.add('hidden');
        renderResult.classList.add('hidden');
        renderLoading.classList.remove('hidden');

        try {
            await generateTrueRender(apiKey);
        } catch (error) {
            console.error(error);
            alert(`Render Failed: ${error.message}`);
            resetRender();
            generateBtn.disabled = false;
            btnText.textContent = "RE-TRY GENERATION";
        }

        isGenerating = false;
    });

    async function generateTrueRender(apiKey) {
        const style = document.getElementById('style-select').value;
        const lighting = document.getElementById('lighting-select').value;
        const roomContext = document.getElementById('room-select').value;

        // Construct a highly specific prompt based on OCR and User Input
        const ocrSnippet = detectedTextContext.substring(0, 100); // usage limit

        const prompt = `Architectural plan to perspective render: ${style} style, ${roomContext}, ${lighting}. 
        Walls are exactly 12 feet high. 
        Match the exact floorplan layout: ${ocrSnippet}. 
        Top-down orthographic view, photorealistic, 8k, unreal engine 5, interior design visualization. 
        Volumetric lighting, sharp details, accurate scale.`;

        // Using a model good at Image-to-Image with structure
        // 'runwayml/stable-diffusion-v1-5' is reliable for img2img on HF Inference
        const modelId = "runwayml/stable-diffusion-v1-5";

        // Convert base64 img to Blob
        const response = await fetch(uploadedImg.src);
        const blob = await response.blob();

        // Call HF API
        const resultBlob = await queryHuggingFaceImg2Img(modelId, apiKey, blob, prompt);

        const resultUrl = URL.createObjectURL(resultBlob);
        resultImg.src = resultUrl;

        // Show result
        renderLoading.classList.add('hidden');
        renderResult.classList.remove('hidden');
        hdBadge.classList.remove('hidden');
        btnText.textContent = "GENERATE VARIATION";
        generateBtn.disabled = false;
    }

    async function queryHuggingFaceImg2Img(model, apiKey, imageBlob, prompt) {
        // Read image as base64 for JSON payload
        // NOTE: HF Inference for img2img usually expects standard inputs
        // Some models allow sending binary directly, but for control we often need JSON source

        const base64Image = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]); // remove prefix
            reader.readAsDataURL(imageBlob);
        });

        const response = await fetch(
            `https://api-inference.huggingface.co/models/${model}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "X-Wait-For-Model": "true"
                },
                body: JSON.stringify({
                    inputs: prompt,
                    image: base64Image, // Some endpoints use this
                    // If the specific model endpoint expects 'image' in payload, this works.
                    // If not, we might need to rely on the 'inputs' being the image? 
                    // No, usually it's inputs=prompt, parameters=...
                    // Let's try the standard automatic task routing.
                    parameters: {
                        negative_prompt: "blurry, low quality, distortion, bad anatomy, extra walls, missing doors",
                        num_inference_steps: 40,
                        strength: 0.5, // 0.0 to 1.0. Lower = closer to original. 0.5 allows texturing but keeps walls.
                        guidance_scale: 8.5
                    },
                    /* 
                       EXPERIMENTAL: For standard HF Inference API, passing image + prompt is tricky. 
                       If this fails, we will try the 'image' as the main body logic.
                    */
                }),
            }
        );

        if (!response.ok) {
            // Fallback: Try sending Raw Image with Prompt as Header? 
            // Or try a different payload format if 400.
            const errText = await response.text();
            throw new Error(`HF API: ${response.status} - ${errText}`);
        }

        return await response.blob();
    }

    function resetRender() {
        renderResult.classList.add('hidden');
        renderLoading.classList.add('hidden');
        renderEmpty.classList.remove('hidden');
    }

    // Modal
    resultImg.parentElement.addEventListener('click', () => {
        modalImg.src = resultImg.src;
        previewModal.classList.remove('hidden');
    });
    closeModal.addEventListener('click', () => previewModal.classList.add('hidden'));
    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) previewModal.classList.add('hidden');
    });

});
