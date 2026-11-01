document.addEventListener("DOMContentLoaded", () => {
    const libraryGrid = document.getElementById("libraryGrid");
    const emptyLibraryMsg = document.getElementById("emptyLibraryMsg");
    const downloadStatusBar = document.getElementById("downloadStatusBar");
    const downloadingGameName = document.getElementById("downloadingGameName");
    let downloadStatusTimer;
    let library;
    try {
        const savedLibrary = JSON.parse(localStorage.getItem("brickStoreLibrary") || "[]");
        library = Array.isArray(savedLibrary)
            ? savedLibrary.filter(item => item && typeof item === "object"
                && typeof item.name === "string" && typeof item.img === "string")
            : [];
        const hasSimulatedInstallStatus = library.some(item => item.status === "Installed" || item.status === "Downloaded");
        if (hasSimulatedInstallStatus) {
            library.forEach(item => {
                if (item.status === "Installed" || item.status === "Downloaded") delete item.status;
            });
            localStorage.setItem("brickStoreLibrary", JSON.stringify(library));
        }
    } catch (error) {
        console.error("Could not read the library data.", error);
        library = [];
    }
    function renderLibrary() {
        if (!libraryGrid) return;
        libraryGrid.innerHTML = "";

        if (library.length === 0) {
            if (emptyLibraryMsg) emptyLibraryMsg.style.display = "block";
            return;
        }

        if (emptyLibraryMsg) emptyLibraryMsg.style.display = "none";
        library.forEach((item, index) => {
            const card = document.createElement("div");
            card.className = "game-card";

            const image = document.createElement("img");
            image.src = item.img;
            image.alt = item.name;

            const title = document.createElement("h3");
            title.textContent = item.name;

            const status = document.createElement("span");
            status.className = "badge-free";
            status.textContent = translate("ready");

            const progressPercentage = document.createElement("div");
            progressPercentage.className = "download-percentage";
            progressPercentage.textContent = "0%";

            const progressContainer = document.createElement("div");
            progressContainer.className = "download-progress-container";
            const progressBar = document.createElement("div");
            progressBar.className = "download-progress-bar";
            progressContainer.appendChild(progressBar);

            const buttons = document.createElement("div");
            buttons.className = "card-buttons";

            const downloadButton = document.createElement("button");
            downloadButton.className = "btn-download";
            downloadButton.dataset.index = String(index);
            downloadButton.textContent = translate("download");

            const removeButton = document.createElement("button");
            removeButton.className = "btn-remove";
            removeButton.dataset.index = String(index);
            removeButton.textContent = "-";
            removeButton.setAttribute("aria-label", `${translate("removeFromLibrary")} ${item.name}`);

            buttons.append(downloadButton, removeButton);
            card.append(image, title, status, progressPercentage, progressContainer, buttons);
            libraryGrid.appendChild(card);
        });
    }

    function saveLibrary() {
        localStorage.setItem("brickStoreLibrary", JSON.stringify(library));
    }

    function showDownloadMessage(key) {
        if (!downloadStatusBar || !downloadingGameName) return;
        window.clearTimeout(downloadStatusTimer);
        downloadStatusBar.style.display = "block";
        downloadingGameName.textContent = translate(key);
        downloadStatusTimer = window.setTimeout(() => {
            downloadStatusBar.style.display = "none";
        }, 5000);
    }

    function confirmLargeDownload(name) {
        const bytes = window.BrickStoreDownloads.getArchiveSize(name);
        const threshold = Number(localStorage.getItem("brickStoreLargeDownloadThreshold") || 100);
        const sizeMb = bytes ? Math.ceil(bytes / (1024 * 1024)) : 0;
        if (!threshold || sizeMb <= threshold) return true;
        return window.confirm(translate("largeDownloadConfirm")
            .replace("{name}", name)
            .replace("{size}", sizeMb));
    }

    function formatSize(bytes) {
        if (bytes === 0) return "0 MB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    function formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return "";
        if (seconds < 60) return Math.ceil(seconds) + " " + translate("secondsRemaining");
        const mins = Math.floor(seconds / 60);
        return mins + " " + translate("minutesRemaining");
    }

    const archiveExtensions = [".zip", ".rar", ".7z", ".exe", ".msi"];

    function candidateArchiveFiles(name) {
        const base = String(name || "").replace(/[\/\\?%*:|"<>]/g, "").trim();
        if (!base) return [];
        const lower = base.toLowerCase();
        const candidates = [];
        archiveExtensions.forEach(ext => {
            if (!lower.endsWith(ext)) candidates.push(base + ext);
        });
        candidates.push(base);
        return candidates;
    }

    async function archiveExists(url) {
        try {
            const response = await fetch(url, { method: "HEAD" });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async function findArchiveUrl(name) {
        for (const file of candidateArchiveFiles(name)) {
            const url = new URL(`store/downloads/${encodeURIComponent(file)}`, document.baseURI).href;
            if (await archiveExists(url)) return url;
        }
        return window.BrickStoreDownloads ? window.BrickStoreDownloads.getArchiveUrl(name) : null;
    }

    async function downloadItem(index, button) {
        const item = library[index];
        if (!item) return;

        const archiveUrl = await findArchiveUrl(item.name);
        if (!archiveUrl) {
            showDownloadMessage("downloadPackageUnavailable");
            return;
        }

        if (!confirmLargeDownload(item.name)) return;
        
        const card = button.closest(".game-card");
        const progressBar = card.querySelector(".download-progress-bar");
        const progressContainer = card.querySelector(".download-progress-container");
        const progressPercentage = card.querySelector(".download-percentage");
        
        button.disabled = true;
        progressContainer.style.display = "block";
        progressPercentage.style.display = "block";
        progressBar.style.width = "1%"; // Start with 1% to show it's active
        progressPercentage.textContent = translate("downloading");

        const startTime = Date.now();

        try {
            const response = await fetch(archiveUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const contentLength = response.headers.get('content-length');
            let total = contentLength ? parseInt(contentLength, 10) : 0;
            
            // Fallback to predefined size
            if (total === 0) {
                total = window.BrickStoreDownloads.getArchiveSize(item.name);
            }
            
            const reader = response.body.getReader();
            let loaded = 0;
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                chunks.push(value);
                loaded += value.length;
                
                if (total > 0) {
                    const percent = Math.min(99, Math.round((loaded / total) * 100));
                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = loaded / (elapsed || 0.1);
                    const remaining = (total - loaded) / (speed || 1);
                    
                    progressBar.style.width = `${percent}%`;
                    const timeStr = formatTime(remaining);
                    progressPercentage.textContent = `↓ ${formatSize(loaded)} / ${formatSize(total)}` + (timeStr ? ` • ${timeStr}` : "");
                } else {
                    progressPercentage.textContent = `↓ ${formatSize(loaded)}`;
                    progressBar.style.width = `${Math.min(95, (loaded / (1024 * 1024 * 50)) * 100)}%`; 
                }
            }

            progressBar.style.width = "100%";
            progressPercentage.textContent = translate("downloadComplete");

            const blob = new Blob(chunks);
            const blobUrl = URL.createObjectURL(blob);
            
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = decodeURIComponent(archiveUrl.split("/").pop())
                || `${item.name.replace(/[\/\\?%*:|"<>]/g, "")}.zip`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            
            // Clean up the blob URL after a short delay
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

            showDownloadMessage("downloadRequested");
            
            // Hide progress after success
            setTimeout(() => {
                progressContainer.style.display = "none";
                progressPercentage.style.display = "none";
            }, 2000);

        } catch (error) {
            console.error(`Could not start the download for ${item.name}.`, error);
            showDownloadMessage("downloadStartFailed");
            progressContainer.style.display = "none";
            progressPercentage.style.display = "none";
        } finally {
            const updatedButton = libraryGrid.querySelector(`.btn-download[data-index="${index}"]`);
            if (updatedButton) {
                updatedButton.disabled = false;
                updatedButton.textContent = translate("download");
            }
        }
    }

    libraryGrid.addEventListener("click", event => {
        const button = event.target.closest("button");
        if (!button) return;
        const index = Number(button.dataset.index);
        if (!Number.isInteger(index) || index < 0 || index >= library.length) return;
        if (button.classList.contains("btn-remove")) {
            library.splice(index, 1);
            saveLibrary();
            renderLibrary();
        } else if (button.classList.contains("btn-download")) {
            downloadItem(index, button);
        }
    });

    renderLibrary();
});
