'use strict';

(function () {
	// Theme setup
	const THEME_KEY = 'ir_theme';
	function applyTheme(theme) {
		const root = document.documentElement;
		if (theme === 'dark') {
			root.classList.add('dark');
		} else {
			root.classList.remove('dark');
		}
	}
	function initTheme() {
		const saved = localStorage.getItem(THEME_KEY);
		if (saved === 'dark' || saved === 'light') {
			applyTheme(saved);
			return;
		}
		const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
		applyTheme(prefersDark ? 'dark' : 'light');
	}
	function toggleTheme() {
		const isDark = document.documentElement.classList.contains('dark');
		const next = isDark ? 'light' : 'dark';
		applyTheme(next);
		localStorage.setItem(THEME_KEY, next);
	}
	document.addEventListener('DOMContentLoaded', function () {
		const t = document.getElementById('themeToggle');
		if (t) t.addEventListener('click', toggleTheme);
	});
	initTheme();

	// State
	let selectedFiles = [];

	// Elements
	const $fileInput = $('#fileInput');
	const $dropZone = $('#dropZone');
	const $previewList = $('#previewList');
	const $summaryText = $('#summaryText');
	const $processBtn = $('#processBtn');
	const $clearBtn = $('#clearBtn');
	const $targetWidth = $('#targetWidth');
	const $targetHeight = $('#targetHeight');
	const $lockRatio = $('#lockRatio');
	const $quality = $('#quality');
	const $outputFormat = $('#outputFormat');
	const $targetSizeKB = $('#targetSizeKB');
	const $presetSize = $('#presetSize');
	const $downloadAllBtn = $('#downloadAllBtn');

	function formatBytes(bytes) {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	function showToast(msg) {
		const t = document.createElement('div');
		t.className = 'fixed bottom-[max(24px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-3 rounded-full shadow-2xl text-sm font-semibold z-[100] transition-opacity duration-300 w-max max-w-[90vw] text-center dark:bg-indigo-600';
		t.innerText = msg;
		document.body.appendChild(t);
		setTimeout(() => {
			t.style.opacity = '0';
			setTimeout(() => t.remove(), 300);
		}, 3000);
	}

	async function downloadFileNative(blob, filename) {
		if (window.Capacitor && window.Capacitor.isNativePlatform()) {
			try {
				const reader = new FileReader();
				reader.readAsDataURL(blob);
				reader.onloadend = async function() {
					const base64data = reader.result;
					const base64Content = base64data.includes(',') ? base64data.split(',')[1] : base64data;
					const Filesystem = window.Capacitor.Plugins.Filesystem;
					const Media = window.Capacitor.Plugins.Media;
					
					const savedCacheFile = await Filesystem.writeFile({
						path: filename,
						data: base64Content,
						directory: 'CACHE'
					});

					if (Media) {
						try {
							await Media.savePhoto({ path: savedCacheFile.uri });
							showToast('Saved to Camera Roll! 🖼️');
							return;
						} catch(err) {
							console.error('Save Photo error:', err);
						}
					}
					
					await Filesystem.writeFile({
						path: 'ImageResizer/' + filename,
						data: base64Content,
						directory: 'DOCUMENTS',
						recursive: true
					});
					
					showToast('Saved to Documents/ImageResizer');
				};
			} catch(e) {
				console.error('Native download error: ', e);
				saveAs(blob, filename); // ultimate fallback
			}
		} else {
			// standard web download
			saveAs(blob, filename);
		}
	}

	function reset() {
		selectedFiles = [];
		$previewList.empty();
		const pC = document.getElementById('previewContainer');
		if (pC) pC.classList.add('hidden');
		$summaryText.text('No images selected');
		$processBtn.prop('disabled', true);
		$downloadAllBtn.prop('disabled', true);
		$fileInput.val('');
	}

	function updateSummary() {
		if (!selectedFiles.length) {
			$summaryText.text('No images selected');
			$processBtn.prop('disabled', true);
			$downloadAllBtn.prop('disabled', true);
			return;
		}
		const totalSize = selectedFiles.reduce((acc, f) => acc + (f.file?.size || 0), 0);
		$summaryText.text(selectedFiles.length + ' file(s) • ' + formatBytes(totalSize));
		$processBtn.prop('disabled', false);
		$downloadAllBtn.prop('disabled', selectedFiles.every(f => !f.processed));
	}

	function readFileAsDataURL(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	function loadImage(src) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = src;
		});
	}

	function getOutputMime(inputMime, selection) {
		if (selection && selection !== 'original') return selection;
		return inputMime || 'image/jpeg';
	}

	async function canvasToBlobWithQuality(canvas, mime, quality) {
		return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
	}

	async function resizeBase(canvas, img, newWidth, newHeight) {
		canvas.width = newWidth;
		canvas.height = newHeight;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0, newWidth, newHeight);
	}

	async function resizeAndCompress(file, options) {
		const { targetWidth, targetHeight, maintainRatio, quality, format, targetSizeBytes } = options;
		const dataUrl = await readFileAsDataURL(file);
		const img = await loadImage(dataUrl);

		let newWidth = targetWidth || img.width;
		let newHeight = targetHeight || img.height;

		if (maintainRatio) {
			if (targetWidth && !targetHeight) {
				newHeight = Math.round((img.height / img.width) * targetWidth);
			} else if (!targetWidth && targetHeight) {
				newWidth = Math.round((img.width / img.height) * targetHeight);
			}
		}

		newWidth = Math.max(1, Math.round(newWidth));
		newHeight = Math.max(1, Math.round(newHeight));

		const canvas = document.createElement('canvas');
		await resizeBase(canvas, img, newWidth, newHeight);

		const mime = getOutputMime(file.type, format);

		if (targetSizeBytes && (mime === 'image/jpeg' || mime === 'image/webp')) {
			let lo = 0.1;
			let hi = 1.0;
			let bestBlob = null;
			let bestQuality = hi;
			for (let i = 0; i < 10; i++) {
				const mid = (lo + hi) / 2;
				const blob = await canvasToBlobWithQuality(canvas, mime, mid);
				if (!blob) break;
				if (blob.size > targetSizeBytes) {
					hi = mid;
				} else {
					bestBlob = blob;
					bestQuality = mid;
					lo = mid;
				}
			}
			const finalBlob = bestBlob || await canvasToBlobWithQuality(canvas, mime, bestQuality);
			const outUrl = URL.createObjectURL(finalBlob);
			return { blob: finalBlob, url: outUrl, width: newWidth, height: newHeight, mime };
		}

		const blob = await canvasToBlobWithQuality(canvas, mime, quality);
		const outUrl = URL.createObjectURL(blob);
		return { blob, url: outUrl, width: newWidth, height: newHeight, mime };
	}

	function createPreviewCard(id, original, processed) {
		const $card = $('<div class="border rounded-md overflow-hidden bg-white shadow-sm dark:bg-slate-800 dark:border-slate-700"></div>');
		const $imgWrap = $('<div class="bg-slate-100 aspect-video flex items-center justify-center overflow-hidden dark:bg-slate-900"></div>');
		const $img = $('<img class="max-h-48 object-contain">');
		$img.attr('src', processed?.url || original.previewUrl);
		$imgWrap.append($img);

		const $meta = $('<div class="p-3 text-sm space-y-1"></div>');
		const name = original.file.name;
		const $title = $('<div class="font-medium truncate"></div>').text(name);
		const $sizes = $('<div class="text-xs text-slate-500 dark:text-slate-400"></div>');
		const origInfo = original.imgWidth + 'x' + original.imgHeight + ' • ' + formatBytes(original.file.size);
		let procInfo = '';
		if (processed) {
			procInfo = ' → ' + processed.width + 'x' + processed.height + ' • ' + formatBytes(processed.blob.size);
		}
		$sizes.text(origInfo + procInfo);

		const $actions = $('<div class="flex gap-2 pt-3"></div>');
		const $download = $('<button class="inline-flex flex-[2] items-center justify-center px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-md shadow-indigo-200 active:bg-indigo-700 transition dark:shadow-none">Save</button>');
		const $view = $('<button class="inline-flex flex-1 items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold active:bg-slate-200 transition dark:bg-slate-700/50 dark:text-slate-200 dark:active:bg-slate-600">View</button>');
		const $remove = $('<button class="inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-100 text-slate-500 active:bg-red-50 active:text-red-500 transition dark:bg-slate-700/50 dark:text-slate-400 dark:active:bg-red-900/20"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>');

		if (processed?.url) {
			const ext = processed.mime.split('/')[1] || 'jpg';
			const base = name.replace(/\.[^.]+$/, '');
			const fileName = base + '-resized.' + ext;
			$download.on('click', function(e) {
				e.preventDefault();
				downloadFileNative(processed.blob, fileName);
			});
			$view.on('click', function() {
				const $modal = $('#previewModal');
				$('#modalImage').attr('src', processed.url);
				$modal.removeClass('hidden').addClass('flex');
				$('#modalDownload').off('click').on('click', () => downloadFileNative(processed.blob, fileName));
			});
		} else {
			$download.addClass('opacity-50 cursor-not-allowed').attr('disabled', true);
			$view.addClass('opacity-50 cursor-not-allowed').attr('disabled', true);
		}

		$remove.on('click', function () {
			selectedFiles = selectedFiles.filter(function (f) { return f.id !== id; });
			$card.remove();
			updateSummary();
		});

		$meta.append($title, $sizes);
		$actions.append($download, $view, $remove);
		$card.append($imgWrap, $meta, $('<div class="px-3 pb-3"></div>').append($actions));
		return $card;
	}

	async function addFiles(files) {
		const arr = Array.from(files || []);
		for (const file of arr) {
			if (!file.type.startsWith('image/')) continue;

			const id = Math.random().toString(36).slice(2);
			const previewUrl = URL.createObjectURL(file);
			try {
				const dataUrl = await readFileAsDataURL(file);
				const img = await loadImage(dataUrl);
				const item = { id, file, previewUrl, imgWidth: img.width, imgHeight: img.height, processed: null };
				selectedFiles.push(item);
				const $card = createPreviewCard(id, item, null);
				$card.attr('data-id', id);
				$previewList.append($card);
			} catch (err) {
				console.error('Failed to load image', err);
			}
		}
		
		const pC = document.getElementById('previewContainer');
		if (selectedFiles.length > 0) {
			if (pC) pC.classList.remove('hidden');
		} else {
			if (pC) pC.classList.add('hidden');
		}

		updateSummary();
	}

	async function processAll() {
		if (!selectedFiles.length) return;
		$processBtn.prop('disabled', true).html('<span class="opacity-80">Processing...</span>');
		
		// Yield to browser UI thread so "Processing..." button text renders before blocking JS executes
		await new Promise(resolve => setTimeout(resolve, 50));
		
		try {
			const options = {
				targetWidth: parseInt($targetWidth.val(), 10) || undefined,
				targetHeight: parseInt($targetHeight.val(), 10) || undefined,
				maintainRatio: $lockRatio.is(':checked'),
				quality: parseFloat($quality.val()) || 0.8,
				format: $outputFormat.val(),
				targetSizeBytes: (parseInt($targetSizeKB.val(), 10) > 0) ? parseInt($targetSizeKB.val(), 10) * 1024 : undefined
			};

			for (let i = 0; i < selectedFiles.length; i++) {
				const item = selectedFiles[i];
				try {
					const processed = await resizeAndCompress(item.file, options);
					item.processed = processed;
					const $card = $previewList.find('[data-id="' + item.id + '"]');
					const $newCard = createPreviewCard(item.id, item, processed);
					$card.replaceWith($newCard);
				} catch (e) {
					console.error('Processing failed for', item.file.name, e);
				}
			}
		} finally {
			$processBtn.prop('disabled', false).text('Process Images');
			updateSummary();
		}
	}

	// Drag & drop and click to open dialog
	const $drop = $dropZone;
	$drop.on('click', function (e) {
		e.preventDefault();
		e.stopPropagation();
		$fileInput.trigger('click');
	});
	$drop.on('dragover dragenter', function (e) {
		e.preventDefault();
		e.stopPropagation();
		$drop.addClass('ring-2 ring-indigo-400');
	});
	$drop.on('dragleave dragend drop', function (e) {
		e.preventDefault();
		e.stopPropagation();
		$drop.removeClass('ring-2 ring-indigo-400');
	});
	$drop.on('drop', function (e) {
		const files = e.originalEvent.dataTransfer.files;
		addFiles(files);
	});

	$fileInput.on('change', function () {
		addFiles($fileInput[0].files);
		$fileInput.val('');
	});
	$processBtn.on('click', function () { processAll(); });
	$clearBtn.on('click', function () { reset(); });

	// Aspect ratio helper
	let lastKnownAspect = null;
	$lockRatio.on('change', function () {
		if ($lockRatio.is(':checked') && selectedFiles[0]) {
			lastKnownAspect = selectedFiles[0].imgWidth / selectedFiles[0].imgHeight;
		}
	});
	$targetWidth.on('input', function () {
		if ($lockRatio.is(':checked')) {
			const w = parseInt($targetWidth.val(), 10);
			if (w > 0) {
				const ratio = lastKnownAspect || (selectedFiles[0] ? selectedFiles[0].imgWidth / selectedFiles[0].imgHeight : null);
				if (ratio) {
					$targetHeight.val(Math.round(w / ratio));
				}
			}
		}
	});
	$targetHeight.on('input', function () {
		if ($lockRatio.is(':checked')) {
			const h = parseInt($targetHeight.val(), 10);
			if (h > 0) {
				const ratio = lastKnownAspect || (selectedFiles[0] ? selectedFiles[0].imgWidth / selectedFiles[0].imgHeight : null);
				if (ratio) {
					$targetWidth.val(Math.round(h * ratio));
				}
			}
		}
	});

	// Toggle quality slider based on target size
	function syncQualityDisabled() {
		const hasTarget = parseInt($targetSizeKB.val(), 10) > 0;
		$quality.prop('disabled', hasTarget);
	}
	$targetSizeKB.on('input change', syncQualityDisabled);

	// Preset sizes
	$presetSize.on('change', function () {
		const val = $presetSize.val();
		if (!val) return;
		const parts = val.split('x');
		const w = parseInt(parts[0], 10);
		const h = parseInt(parts[1], 10);
		if (w > 0 && h > 0) {
			$targetWidth.val(w);
			$targetHeight.val(h);
		}
	});

	// Modal Close logic
	function closePreviewModal() {
		$('#previewModal').addClass('hidden').removeClass('flex');
		$('#modalImage').attr('src', '');
	}
	$('#closePreview, #modalCloseBtn').on('click', closePreviewModal);
	$('#previewModal').on('click', function(e) {
		if (e.target === this) closePreviewModal();
	});

	// Download All (ZIP)
	async function downloadAllZip() {
		const zip = new JSZip();
		const folder = zip.folder('images');
		for (const item of selectedFiles) {
			if (!item.processed?.blob) continue;
			const name = item.file.name.replace(/\.[^.]+$/, '');
			const ext = item.processed.mime.split('/')[1] || 'jpg';
			const fileName = name + '-resized.' + ext;
			const arrayBuffer = await item.processed.blob.arrayBuffer();
			folder.file(fileName, arrayBuffer);
		}
		const content = await zip.generateAsync({ type: 'blob' });
		downloadFileNative(content, 'images-resized.zip');
	}
	$downloadAllBtn.on('click', function () {
		if ($downloadAllBtn.is(':disabled')) return;
		downloadAllZip();
	});

})();
