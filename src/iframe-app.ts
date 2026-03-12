/**
 * Phoenix - 智能元件替换
 * 前端应用逻辑
 */

// ==================== 类型定义 ====================

interface ComponentItem {
	primitiveId: string;
	designator: string;
	name: string;
	footprint: string;
	libraryUuid: string;
	componentUuid: string;
	manufacturer?: string;
	pinCount: number;
}

interface SearchResult {
	uuid: string;
	libraryUuid: string;
	name: string;
	footprint?: string;
	manufacturer?: string;
	description?: string;
	pinCount?: number;
	jlcPrice?: number;
	lcscPrice?: number;
	jlcInventory?: number;
	lcscInventory?: number;
	supplier?: string;
	supplierId?: string;
}

interface PinMapping {
	oldPinNumber: string;
	oldPinName: string;
	newPinNumber: string;
	newPinName: string;
	netName: string;
	matchType: 'exact' | 'name' | 'manual';
}

type SortType = 'price-asc' | 'price-desc' | 'inventory-desc' | 'inventory-asc' | 'pins-asc' | 'pins-desc';

// ==================== 全局状态 ====================

let allComponents: ComponentItem[] = [];
let selectedComponents: ComponentItem[] = [];
let selectedNewComponent: SearchResult | null = null;
let currentPinMappings: PinMapping[] = [];

// 搜索相关状态
let searchResults: SearchResult[] = [];
let filterManufacturer = '';
let filterFootprint = '';

// Bootstrap 模态框实例
let searchModal: bootstrap.Modal | null = null;
let pinMappingModal: bootstrap.Modal | null = null;
let resultModal: bootstrap.Modal | null = null;

// EDA API - 直接从 window 获取
const edaApi = (window as any).eda || (window.parent as any)?.eda || (window.top as any)?.eda;

// ==================== 调试日志模块 ====================

const DebugLog = {
	enabled: true,
	logElement: null as HTMLElement | null,

	init(): void {
		this.logElement = document.getElementById('debugLog');
		this.log('info', '调试日志初始化完成');
		this.log('info', `EDA对象存在: ${edaApi ? '是' : '否'}`);
	},

	log(level: 'info' | 'success' | 'warning' | 'error', message: string): void {
		if (!this.enabled) return;

		const time = new Date().toLocaleTimeString();
		const logEntry = document.createElement('div');
		logEntry.className = `debug-log-entry ${level}`;
		logEntry.innerHTML = `<span class="debug-log-time">[${time}]</span>${message}`;

		if (this.logElement) {
			this.logElement.appendChild(logEntry);
			this.logElement.scrollTop = this.logElement.scrollHeight;
		}

		console.log(`[Phoenix ${level.toUpperCase()}] ${message}`);
	},

	info(message: string): void {
		this.log('info', message);
	},
	success(message: string): void {
		this.log('success', message);
	},
	warning(message: string): void {
		this.log('warning', message);
	},
	error(message: string): void {
		this.log('error', message);
	},

	clear(): void {
		if (this.logElement) {
			this.logElement.innerHTML = '';
		}
		this.log('info', '日志已清空');
	},
};

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', () => {
	DebugLog.init();
	initModals();
	initEventListeners();
	DebugLog.info('页面初始化完成');
});

/**
 * 初始化模态框
 */
function initModals(): void {
	try {
		const searchModalEl = document.getElementById('searchModal');
		const pinMappingModalEl = document.getElementById('pinMappingModal');
		const resultModalEl = document.getElementById('resultModal');

		if (searchModalEl) searchModal = new bootstrap.Modal(searchModalEl);
		if (pinMappingModalEl) pinMappingModal = new bootstrap.Modal(pinMappingModalEl);
		if (resultModalEl) resultModal = new bootstrap.Modal(resultModalEl);

		DebugLog.info('模态框初始化完成');
	} catch (e) {
		DebugLog.error(`模态框初始化失败: ${e}`);
	}
}

/**
 * 初始化事件监听
 */
function initEventListeners(): void {
	// 清空日志
	document.getElementById('clearLogBtn')?.addEventListener('click', () => DebugLog.clear());

	// 刷新按钮
	document.getElementById('refreshBtn')?.addEventListener('click', () => loadAllComponents());

	// 清空选择按钮
	document.getElementById('clearSelectionBtn')?.addEventListener('click', () => clearSelection());

	// 全选复选框
	(document.getElementById('selectAll') as HTMLInputElement)?.addEventListener('change', handleSelectAll);

	// 筛选输入框
	(document.getElementById('filterInput') as HTMLInputElement)?.addEventListener('input', handleFilter);

	// 选择新元件按钮
	document.getElementById('selectNewComponentBtn')?.addEventListener('click', openSearchModal);

	// 搜索相关事件
	document.getElementById('searchBtn')?.addEventListener('click', searchNewComponents);
	document.getElementById('clearSearchBtn')?.addEventListener('click', clearSearchResults);
	document.getElementById('clearSelectedBtn')?.addEventListener('click', clearSelectedComponent);

	// 搜索输入框回车
	(document.getElementById('newComponentSearch') as HTMLInputElement)?.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') searchNewComponents();
	});

	// 排序按钮
	document.getElementById('sortPriceBtn')?.addEventListener('click', () => handleSort('price-asc'));
	document.getElementById('sortInventoryBtn')?.addEventListener('click', () => handleSort('inventory-desc'));
	document.getElementById('sortPinsBtn')?.addEventListener('click', () => handleSort('pins-asc'));

	// 筛选下拉框
	(document.getElementById('filterManufacturer') as HTMLSelectElement)?.addEventListener('change', (e) => {
		filterManufacturer = (e.target as HTMLSelectElement).value;
		renderSearchResults();
	});

	(document.getElementById('filterFootprint') as HTMLSelectElement)?.addEventListener('change', (e) => {
		filterFootprint = (e.target as HTMLSelectElement).value;
		renderSearchResults();
	});

	// 确认选择新元件
	document.getElementById('confirmNewComponentBtn')?.addEventListener('click', confirmNewComponentSelection);

	// 执行替换按钮
	document.getElementById('executeReplaceBtn')?.addEventListener('click', openPinMappingModal);

	// 确认替换按钮
	document.getElementById('confirmReplaceBtn')?.addEventListener('click', executeReplace);
}

/**
 * 显示 Toast 消息
 */
function showToast(msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): void {
	if (edaApi?.sys_Message) {
		const t =
			{
				success: (window as any).ESYS_ToastMessageType?.SUCCESS,
				error: (window as any).ESYS_ToastMessageType?.ERROR,
				warning: (window as any).ESYS_ToastMessageType?.WARNING,
			}[type] || (window as any).ESYS_ToastMessageType?.INFO;
		try {
			edaApi.sys_Message.showToastMessage(msg, t, 3);
		} catch (e) {
			console.error('Toast failed:', e);
		}
	}
}

/**
 * 读取状态属性（优先方法，其次字段）
 */
function readState<T>(target: unknown, methodName: string, fieldNames: string[]): T | undefined {
	if (!target || typeof target !== 'object') return undefined;

	const method = (target as Record<string, unknown>)[methodName];
	if (typeof method === 'function') {
		try {
			return (method as () => T).call(target);
		} catch {}
	}

	for (const fieldName of fieldNames) {
		if (fieldName in (target as Record<string, unknown>)) {
			return (target as Record<string, T | undefined>)[fieldName];
		}
	}
	return undefined;
}

/**
 * 格式化价格
 */
function formatPrice(price?: number): string {
	if (price === undefined || price === null) return '-';
	return `¥${price.toFixed(2)}`;
}

/**
 * 格式化库存
 */
function formatInventory(inventory?: number): string {
	if (inventory === undefined || inventory === null) return '-';
	if (inventory >= 10000) return `${(inventory / 10000).toFixed(1)}万`;
	return String(inventory);
}

// ==================== 元件列表加载 ====================

/**
 * 检查是否为真实元件
 */
function isRealComponent(comp: unknown): boolean {
	const primitiveType = readState<string>(comp, 'getState_PrimitiveType', ['primitiveType']);
	const componentType = readState<string>(comp, 'getState_ComponentType', ['componentType']);
	return (
		primitiveType === (window as any).ESCH_PrimitiveType?.COMPONENT && componentType === (window as any).ESCH_PrimitiveComponentType?.COMPONENT
	);
}

/**
 * 从元件对象提取名称
 */
function extractComponentName(comp: unknown): string {
	if (comp && typeof comp === 'object' && 'manufacturerId' in comp) {
		const manufacturerId = (comp as Record<string, unknown>).manufacturerId;
		if (typeof manufacturerId === 'string') return manufacturerId;
	}
	return readState<string>(comp, 'getState_Name', ['name']) || '未知';
}

/**
 * 处理单个元件并返回元件信息
 */
async function processComponent(comp: unknown): Promise<ComponentItem | null> {
	const primitiveId = readState<string>(comp, 'getState_PrimitiveId', ['primitiveId']) || '';
	if (!primitiveId) return null;

	const designator = readState<string>(comp, 'getState_Designator', ['designator']) || '?';
	const name = extractComponentName(comp);
	const componentInfo = readState<{ libraryUuid: string; uuid: string }>(comp, 'getState_Component', ['component']);
	const footprintInfo = readState<{ libraryUuid: string; uuid: string }>(comp, 'getState_Footprint', ['footprint']);
	const manufacturer = readState<string>(comp, 'getState_Manufacturer', ['manufacturer']);

	let pinCount = 0;
	try {
		const pins = await edaApi.sch_PrimitiveComponent.getAllPinsByPrimitiveId(primitiveId);
		pinCount = pins?.length || 0;
	} catch {
		/* ignore */
	}

	return {
		primitiveId,
		designator,
		name,
		footprint: footprintInfo?.uuid || '-',
		libraryUuid: componentInfo?.libraryUuid || '',
		componentUuid: componentInfo?.uuid || '',
		manufacturer: manufacturer || undefined,
		pinCount,
	};
}

/**
 * 处理单个页面的元件
 */
async function processPageComponents(page: { uuid: string }): Promise<ComponentItem[]> {
	const components: ComponentItem[] = [];
	try {
		await edaApi.dmt_EditorControl.openDocument(page.uuid);
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 100);
		});

		const comps = await edaApi.sch_PrimitiveComponent.getAll();

		for (const comp of comps || []) {
			if (!isRealComponent(comp)) continue;
			const componentItem = await processComponent(comp);
			if (componentItem) components.push(componentItem);
		}
	} catch (e) {
		DebugLog.warning(`扫描图页失败: ${e}`);
	}
	return components;
}

async function loadAllComponents(): Promise<void> {
	DebugLog.info('开始加载元件列表...');

	const tbody = document.getElementById('componentListBody');
	const totalCount = document.getElementById('totalCount');

	if (!tbody) return;

	tbody.innerHTML = `
		<tr>
			<td colspan="4" class="text-center">
				<div class="loading"><div class="loading-spinner"></div><div class="mt-2">加载中...</div></div>
			</td>
		</tr>
	`;

	if (!edaApi) {
		tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">EDA API 不可用</td></tr>';
		return;
	}

	try {
		const currentDoc = await edaApi.dmt_SelectControl.getCurrentDocumentInfo();
		if (!currentDoc || currentDoc.documentType !== 1) {
			tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">当前文档不是原理图</td></tr>';
			showToast('请先打开原理图文档', 'warning');
			return;
		}

		const allPages = await edaApi.dmt_Schematic.getCurrentSchematicAllSchematicPagesInfo();
		if (!allPages || allPages.length === 0) {
			tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">未找到图页</td></tr>';
			return;
		}

		const currentPage = await edaApi.dmt_Schematic.getCurrentSchematicPageInfo();
		const originalPageUuid = currentPage?.uuid;

		allComponents = [];

		for (const page of allPages) {
			const pageComponents = await processPageComponents(page);
			allComponents.push(...pageComponents);
		}

		if (originalPageUuid) {
			try {
				await edaApi.dmt_EditorControl.openDocument(originalPageUuid);
			} catch {
				/* ignore */
			}
		}

		renderComponentList(allComponents);
		if (totalCount) totalCount.textContent = String(allComponents.length);
		showToast(`加载完成: ${allComponents.length} 个元件`, 'success');
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">加载失败: ${errorMsg}</td></tr>`;
		showToast(`加载失败: ${errorMsg}`, 'error');
	}
}

function renderComponentList(components: ComponentItem[]): void {
	const tbody = document.getElementById('componentListBody');
	if (!tbody) return;

	if (components.length === 0) {
		tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">暂无元件</td></tr>';
		return;
	}

	tbody.innerHTML = components
		.map(
			(comp) => `
		<tr data-primitive-id="${comp.primitiveId}">
			<td>${comp.designator || '?'}</td>
			<td>${comp.name || '-'}</td>
			<td>${comp.footprint || '-'}</td>
			<td class="text-center">
				<input type="checkbox" class="component-checkbox" data-primitive-id="${comp.primitiveId}"
					${selectedComponents.some((s) => s.primitiveId === comp.primitiveId) ? 'checked' : ''}>
			</td>
		</tr>
	`,
		)
		.join('');

	tbody.querySelectorAll('.component-checkbox').forEach((checkbox) => {
		checkbox.addEventListener('change', handleComponentSelect);
	});
}

function handleComponentSelect(event: Event): void {
	const checkbox = event.target as HTMLInputElement;
	const primitiveId = checkbox.dataset.primitiveId;
	const row = checkbox.closest('tr');
	if (!primitiveId) return;

	const component = allComponents.find((c) => c.primitiveId === primitiveId);
	if (!component) return;

	if (checkbox.checked) {
		if (!selectedComponents.some((s) => s.primitiveId === primitiveId)) {
			selectedComponents.push(component);
		}
		row?.classList.add('selected-row');
	} else {
		selectedComponents = selectedComponents.filter((s) => s.primitiveId !== primitiveId);
		row?.classList.remove('selected-row');
	}

	renderSelectedList();
	updateButtonStates();
}

function renderSelectedList(): void {
	const tbody = document.getElementById('selectedListBody');
	const selectedCount = document.getElementById('selectedCount');

	if (selectedCount) selectedCount.textContent = String(selectedComponents.length);
	if (!tbody) return;

	if (selectedComponents.length === 0) {
		tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">暂无选中</td></tr>';
		return;
	}

	tbody.innerHTML = selectedComponents
		.map(
			(comp) => `
		<tr>
			<td>${comp.designator || '?'}</td>
			<td>${comp.name || '-'}</td>
			<td class="text-center">
				<button class="btn btn-sm btn-outline-danger remove-btn" data-primitive-id="${comp.primitiveId}">
					<i class="bi bi-x"></i>
				</button>
			</td>
		</tr>
	`,
		)
		.join('');

	tbody.querySelectorAll('.remove-btn').forEach((btn) => {
		btn.addEventListener('click', handleRemoveComponent);
	});
}

function handleRemoveComponent(event: Event): void {
	const btn = event.currentTarget as HTMLButtonElement;
	const primitiveId = btn.dataset.primitiveId;
	if (!primitiveId) return;

	selectedComponents = selectedComponents.filter((s) => s.primitiveId !== primitiveId);

	const checkbox = document.querySelector(`.component-checkbox[data-primitive-id="${primitiveId}"]`) as HTMLInputElement;
	if (checkbox) {
		checkbox.checked = false;
		checkbox.closest('tr')?.classList.remove('selected-row');
	}

	renderSelectedList();
	updateButtonStates();
}

function handleSelectAll(event: Event): void {
	const selectAllCheckbox = event.target as HTMLInputElement;
	const checkboxes = document.querySelectorAll('.component-checkbox') as NodeListOf<HTMLInputElement>;

	checkboxes.forEach((checkbox) => {
		checkbox.checked = selectAllCheckbox.checked;
		const primitiveId = checkbox.dataset.primitiveId;
		const row = checkbox.closest('tr');

		if (primitiveId) {
			const component = allComponents.find((c) => c.primitiveId === primitiveId);
			if (component) {
				if (selectAllCheckbox.checked) {
					if (!selectedComponents.some((s) => s.primitiveId === primitiveId)) {
						selectedComponents.push(component);
					}
					row?.classList.add('selected-row');
				} else {
					selectedComponents = selectedComponents.filter((s) => s.primitiveId !== primitiveId);
					row?.classList.remove('selected-row');
				}
			}
		}
	});

	renderSelectedList();
	updateButtonStates();
}

function handleFilter(event: Event): void {
	const input = event.target as HTMLInputElement;
	const keyword = input.value.toLowerCase().trim();

	if (!keyword) {
		renderComponentList(allComponents);
		return;
	}

	const filtered = allComponents.filter(
		(comp) =>
			(comp.designator || '').toLowerCase().includes(keyword) ||
			(comp.name || '').toLowerCase().includes(keyword) ||
			(comp.footprint || '').toLowerCase().includes(keyword),
	);

	renderComponentList(filtered);
}

function clearSelection(): void {
	selectedComponents = [];
	selectedNewComponent = null;

	document.querySelectorAll('.component-checkbox').forEach((checkbox) => {
		(checkbox as HTMLInputElement).checked = false;
		checkbox.closest('tr')?.classList.remove('selected-row');
	});

	(document.getElementById('selectAll') as HTMLInputElement).checked = false;

	renderSelectedList();
	clearComparePanel();
	updateButtonStates();
}

function clearComparePanel(): void {
	['Model', 'Footprint', 'Pins', 'Manufacturer', 'Price', 'Inventory'].forEach((field) => {
		const oldEl = document.getElementById(`old${field}`);
		const newEl = document.getElementById(`new${field}`);
		if (oldEl) oldEl.textContent = '-';
		if (newEl) newEl.textContent = '-';
	});

	const priceChange = document.getElementById('priceChange');
	if (priceChange) priceChange.innerHTML = '';
}

function updateButtonStates(): void {
	const selectNewComponentBtn = document.getElementById('selectNewComponentBtn') as HTMLButtonElement;
	const executeReplaceBtn = document.getElementById('executeReplaceBtn') as HTMLButtonElement;

	if (selectNewComponentBtn) selectNewComponentBtn.disabled = selectedComponents.length === 0;
	if (executeReplaceBtn) executeReplaceBtn.disabled = selectedComponents.length === 0 || !selectedNewComponent;
}

// ==================== 搜索功能 ====================

function openSearchModal(): void {
	// 重置搜索状态
	searchResults = [];
	selectedNewComponent = null;
	filterManufacturer = '';
	filterFootprint = '';

	// 重置UI
	(document.getElementById('newComponentSearch') as HTMLInputElement).value = '';
	(document.getElementById('filterManufacturer') as HTMLSelectElement).innerHTML = '<option value="">所有制造商</option>';
	(document.getElementById('filterFootprint') as HTMLSelectElement).innerHTML = '<option value="">所有封装</option>';
	document.getElementById('searchResultsBody').innerHTML = '<tr><td colspan="7" class="text-center text-muted">输入关键词搜索元件</td></tr>';
	document.getElementById('searchResultCount').textContent = '0';
	document.getElementById('lowestPrice').textContent = '-';
	document.getElementById('selectedInfo').style.display = 'none';
	(document.getElementById('confirmNewComponentBtn') as HTMLButtonElement).disabled = true;

	searchModal?.show();
}

async function searchNewComponents(): Promise<void> {
	const searchInput = document.getElementById('newComponentSearch') as HTMLInputElement;
	const tbody = document.getElementById('searchResultsBody');

	if (!searchInput || !tbody) return;

	const keyword = searchInput.value.trim();
	if (!keyword) {
		tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">输入关键词搜索元件</td></tr>';
		return;
	}

	DebugLog.info(`搜索元件: ${keyword}`);
	tbody.innerHTML = '<tr><td colspan="7" class="text-center"><div class="loading"><div class="loading-spinner"></div></div></td></tr>';

	try {
		// API: lib_Device.search(key, libraryUuid?, classification?, symbolType?, itemsOfPage?, page?)
		// 第一个参数是字符串 key，不是对象
		const results = await edaApi.lib_Device.search(keyword.trim());
		DebugLog.info(`搜索返回 ${results?.length || 0} 个结果`);

		if (!results || results.length === 0) {
			tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">未找到匹配的元件</td></tr>';
			return;
		}

		// 转换结果
		searchResults = results.map((r: any) => ({
			uuid: r.uuid,
			libraryUuid: r.libraryUuid || '',
			name: r.name || '',
			footprint: r.footprint?.name || r.footprintName || '',
			manufacturer: r.manufacturer || '',
			description: r.description || '',
			pinCount: r.pinCount,
			jlcPrice: r.jlcPrice,
			lcscPrice: r.lcscPrice,
			jlcInventory: r.jlcInventory,
			lcscInventory: r.lcscInventory,
			supplier: r.supplier,
			supplierId: r.supplierId,
		}));

		// 更新筛选下拉框
		updateFilterOptions();

		// 默认按价格升序排序
		sortResults('price-asc');
		renderSearchResults();

		DebugLog.success(`搜索完成，共 ${searchResults.length} 个结果`);
	} catch (error) {
		// 改进错误处理
		let errorMsg = '未知错误';
		if (error instanceof Error) {
			errorMsg = error.message;
		} else if (typeof error === 'string') {
			errorMsg = error;
		} else if (error && typeof error === 'object') {
			errorMsg = JSON.stringify(error);
		}
		DebugLog.error(`搜索失败: ${errorMsg}`);
		tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">搜索失败: ${errorMsg}</td></tr>`;
	}
}

function updateFilterOptions(): void {
	// 提取唯一的制造商列表
	const manufacturers = [...new Set(searchResults.map((r) => r.manufacturer).filter(Boolean))];
	const manufacturerSelect = document.getElementById('filterManufacturer') as HTMLSelectElement;
	if (manufacturerSelect) {
		manufacturerSelect.innerHTML =
			'<option value="">所有制造商</option>' + manufacturers.map((m) => `<option value="${m}">${m}</option>`).join('');
	}

	// 提取唯一的封装列表
	const footprints = [...new Set(searchResults.map((r) => r.footprint).filter(Boolean))];
	const footprintSelect = document.getElementById('filterFootprint') as HTMLSelectElement;
	if (footprintSelect) {
		footprintSelect.innerHTML = '<option value="">所有封装</option>' + footprints.map((f) => `<option value="${f}">${f}</option>`).join('');
	}
}

function handleSort(sortType: SortType): void {
	// 更新按钮状态
	document.querySelectorAll('#searchModal .btn-group .btn').forEach((btn) => {
		btn.classList.remove('btn-outline-phoenix', 'active');
		btn.classList.add('btn-outline-secondary');
	});

	const activeBtn = document.querySelector(`[data-sort="${sortType}"]`);
	if (activeBtn) {
		activeBtn.classList.remove('btn-outline-secondary');
		activeBtn.classList.add('btn-outline-phoenix', 'active');
	}

	sortResults(sortType);
	renderSearchResults();
}

/**
 * 获取排序比较函数
 */
function getCompareFn(sortType: SortType): (a: SearchResult, b: SearchResult) => number {
	const getPrice = (r: SearchResult) => r.jlcPrice || r.lcscPrice;
	const getInventory = (r: SearchResult) => r.jlcInventory || r.lcscInventory;

	switch (sortType) {
		case 'price-asc':
			return (a, b) => (getPrice(a) ?? Infinity) - (getPrice(b) ?? Infinity);
		case 'price-desc':
			return (a, b) => (getPrice(b) ?? 0) - (getPrice(a) ?? 0);
		case 'inventory-desc':
			return (a, b) => (getInventory(b) ?? 0) - (getInventory(a) ?? 0);
		case 'inventory-asc':
			return (a, b) => (getInventory(a) ?? Infinity) - (getInventory(b) ?? Infinity);
		case 'pins-asc':
			return (a, b) => (a.pinCount ?? 0) - (b.pinCount ?? 0);
		case 'pins-desc':
			return (a, b) => (b.pinCount ?? 0) - (a.pinCount ?? 0);
		default:
			return () => 0;
	}
}

function sortResults(sortType: SortType): void {
	searchResults.sort(getCompareFn(sortType));
}

function renderSearchResults(): void {
	const tbody = document.getElementById('searchResultsBody');
	const resultCount = document.getElementById('searchResultCount');
	const lowestPriceEl = document.getElementById('lowestPrice');

	if (!tbody) return;

	// 应用筛选
	let filtered = searchResults;
	if (filterManufacturer) {
		filtered = filtered.filter((r) => r.manufacturer === filterManufacturer);
	}
	if (filterFootprint) {
		filtered = filtered.filter((r) => r.footprint === filterFootprint);
	}

	// 更新统计
	if (resultCount) resultCount.textContent = String(filtered.length);

	// 计算最低价
	const prices = filtered.map((r) => r.jlcPrice || r.lcscPrice).filter((p) => p !== undefined && p !== null) as number[];
	if (lowestPriceEl) {
		lowestPriceEl.textContent = prices.length > 0 ? formatPrice(Math.min(...prices)) : '-';
	}

	if (filtered.length === 0) {
		tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">没有符合条件的结果</td></tr>';
		return;
	}

	// 找出最低价索引用于高亮
	const minPrice = prices.length > 0 ? Math.min(...prices) : null;

	tbody.innerHTML = filtered
		.map((r, index) => {
			const price = r.jlcPrice || r.lcscPrice;
			const inventory = r.jlcInventory || r.lcscInventory;
			const isLowestPrice = price && price === minPrice;

			return `
			<tr class="search-result-row ${isLowestPrice ? 'table-success' : ''}" data-index="${index}">
				<td>
					${r.name || '-'}
					${isLowestPrice ? '<span class="badge bg-success ms-1">最低价</span>' : ''}
				</td>
				<td>${r.footprint || '-'}</td>
				<td class="${isLowestPrice ? 'text-success fw-bold' : ''}">${formatPrice(price)}</td>
				<td>${formatInventory(inventory)}</td>
				<td>${r.manufacturer || '-'}</td>
				<td class="small text-truncate" style="max-width: 150px" title="${r.description || ''}">${r.description || '-'}</td>
				<td class="text-center">
					<input type="radio" name="searchResult" value="${index}">
				</td>
			</tr>
		`;
		})
		.join('');

	// 绑定点击事件
	tbody.querySelectorAll('.search-result-row').forEach((row) => {
		row.addEventListener('click', () => selectSearchResult(row));
	});
}

function selectSearchResult(row: HTMLElement): void {
	const radio = row.querySelector('input[type="radio"]') as HTMLInputElement;
	if (!radio) return;

	radio.checked = true;

	// 更新行样式
	document.querySelectorAll('.search-result-row').forEach((r) => r.classList.remove('highlight-row'));
	row.classList.add('highlight-row');

	// 获取选中的结果
	const index = parseInt(radio.value, 10);
	const filteredResults = getFilteredResults();
	const r = filteredResults[index];

	if (r) {
		selectedNewComponent = r;
		DebugLog.info(`选中搜索结果: ${r.name}, 价格: ${formatPrice(r.jlcPrice || r.lcscPrice)}`);

		// 更新已选信息面板
		document.getElementById('selectedInfo').style.display = 'block';
		document.getElementById('selectedName').textContent = r.name || '-';
		document.getElementById('selectedFootprint').textContent = r.footprint || '-';
		document.getElementById('selectedPrice').textContent = formatPrice(r.jlcPrice || r.lcscPrice);
		document.getElementById('selectedPins').textContent = String(r.pinCount || '-');

		(document.getElementById('confirmNewComponentBtn') as HTMLButtonElement).disabled = false;
	}
}

function getFilteredResults(): SearchResult[] {
	let filtered = searchResults;
	if (filterManufacturer) {
		filtered = filtered.filter((r) => r.manufacturer === filterManufacturer);
	}
	if (filterFootprint) {
		filtered = filtered.filter((r) => r.footprint === filterFootprint);
	}
	return filtered;
}

function clearSearchResults(): void {
	searchResults = [];
	selectedNewComponent = null;
	document.getElementById('searchResultsBody').innerHTML = '<tr><td colspan="7" class="text-center text-muted">输入关键词搜索元件</td></tr>';
	document.getElementById('searchResultCount').textContent = '0';
	document.getElementById('lowestPrice').textContent = '-';
	document.getElementById('selectedInfo').style.display = 'none';
	(document.getElementById('confirmNewComponentBtn') as HTMLButtonElement).disabled = true;
}

function clearSelectedComponent(): void {
	selectedNewComponent = null;
	document.querySelectorAll('.search-result-row').forEach((r) => r.classList.remove('highlight-row'));
	document.querySelectorAll('input[name="searchResult"]').forEach((r) => {
		(r as HTMLInputElement).checked = false;
	});
	document.getElementById('selectedInfo').style.display = 'none';
	(document.getElementById('confirmNewComponentBtn') as HTMLButtonElement).disabled = true;
}

function confirmNewComponentSelection(): void {
	if (!selectedNewComponent) return;

	updateComparePanel();
	searchModal?.hide();
	updateButtonStates();
	DebugLog.success(`已选择新元件: ${selectedNewComponent.name}`);
}

function updateComparePanel(): void {
	if (!selectedNewComponent || selectedComponents.length === 0) return;

	const firstComponent = selectedComponents[0];

	// 原值
	document.getElementById('oldModel').textContent = firstComponent.name || '-';
	document.getElementById('oldFootprint').textContent = firstComponent.footprint || '-';
	document.getElementById('oldPins').textContent = String(firstComponent.pinCount || '-');
	document.getElementById('oldManufacturer').textContent = firstComponent.manufacturer || '-';
	document.getElementById('oldPrice').textContent = '-';
	document.getElementById('oldInventory').textContent = '-';

	// 目标值
	document.getElementById('newModel').textContent = selectedNewComponent.name || '-';
	document.getElementById('newFootprint').textContent = selectedNewComponent.footprint || '-';
	document.getElementById('newPins').textContent = String(selectedNewComponent.pinCount || '-');
	document.getElementById('newManufacturer').textContent = selectedNewComponent.manufacturer || '-';

	const price = selectedNewComponent.jlcPrice || selectedNewComponent.lcscPrice;
	document.getElementById('newPrice').textContent = formatPrice(price);

	const inventory = selectedNewComponent.jlcInventory || selectedNewComponent.lcscInventory;
	document.getElementById('newInventory').textContent = formatInventory(inventory);

	// 价格变化指示
	const priceChange = document.getElementById('priceChange');
	if (priceChange) {
		priceChange.innerHTML = price ? '<span class="badge bg-info">有报价</span>' : '';
	}
}

// ==================== 引脚映射和替换 ====================

async function openPinMappingModal(): Promise<void> {
	if (!selectedNewComponent || selectedComponents.length === 0) return;

	const tbody = document.getElementById('pinMappingBody');
	if (!tbody) return;

	tbody.innerHTML =
		'<tr><td colspan="7" class="text-center"><div class="loading"><div class="loading-spinner"></div><div class="mt-2">分析引脚映射中...</div></div></td></tr>';

	pinMappingModal?.show();

	try {
		const firstComponent = selectedComponents[0];
		const pins = await edaApi.sch_PrimitiveComponent.getAllPinsByPrimitiveId(firstComponent.primitiveId);

		const mappings: PinMapping[] = [];
		for (const pin of pins || []) {
			const pinNumber = readState<string>(pin, 'getState_PinNumber', ['pinNumber']) || '';
			const pinName = readState<string>(pin, 'getState_PinName', ['pinName']) || '';
			const net = readState<string>(pin, 'getState_Net', ['net']) || '';

			mappings.push({
				oldPinNumber: pinNumber,
				oldPinName: pinName,
				newPinNumber: pinNumber,
				newPinName: pinName,
				netName: net,
				matchType: 'exact',
			});
		}

		currentPinMappings = mappings;
		renderPinMappings(currentPinMappings);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">分析失败: ${errorMsg}</td></tr>`;
	}
}

function renderPinMappings(mappings: PinMapping[]): void {
	const tbody = document.getElementById('pinMappingBody');
	if (!tbody) return;

	if (mappings.length === 0) {
		tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暂无映射数据</td></tr>';
		return;
	}

	tbody.innerHTML = mappings
		.map(
			(m) => `
		<tr>
			<td>${m.oldPinNumber}</td>
			<td>${m.oldPinName}</td>
			<td class="text-info">${m.netName || '-'}</td>
			<td>→</td>
			<td>${m.newPinNumber}</td>
			<td>${m.newPinName}</td>
			<td><span class="match-badge match-${m.matchType}">${m.matchType}</span></td>
		</tr>
	`,
		)
		.join('');
}

async function executeReplace(): Promise<void> {
	if (!selectedNewComponent || selectedComponents.length === 0) return;

	const confirmBtn = document.getElementById('confirmReplaceBtn') as HTMLButtonElement;
	if (confirmBtn) {
		confirmBtn.disabled = true;
		confirmBtn.innerHTML = '<span class="loading-spinner"></span> 替换中...';
	}

	showToast(`正在替换 ${selectedComponents.length} 个元件...`, 'info');

	try {
		const deviceFile = await edaApi.sys_FileManager.getDeviceFileByDeviceUuid(selectedNewComponent.uuid, selectedNewComponent.libraryUuid);

		if (!deviceFile) throw new Error('无法获取新元件文件');

		let reconnectedWires = 0;
		let failedWires = 0;
		const details: string[] = [];

		for (const oldComp of selectedComponents) {
			try {
				const component = await edaApi.sch_PrimitiveComponent.get(oldComp.primitiveId);
				if (!component) {
					details.push(`${oldComp.designator}: 无法获取元件信息`);
					failedWires++;
					continue;
				}

				const x = readState<number>(component, 'getState_X', ['x']) || 0;
				const y = readState<number>(component, 'getState_Y', ['y']) || 0;
				const rotation = readState<number>(component, 'getState_Rotation', ['rotation']) || 0;
				const mirror = readState<string>(component, 'getState_Mirror', ['mirror']) || '';
				const designator = readState<string>(component, 'getState_Designator', ['designator']) || '';

				const newComponent = await edaApi.sch_PrimitiveComponent.create(deviceFile, x, y, undefined, rotation, mirror);

				if (!newComponent) {
					details.push(`${oldComp.designator}: 创建新元件失败`);
					failedWires++;
					continue;
				}

				if (designator) {
					await newComponent.setState_Designator(designator);
					await newComponent.done();
				}

				await edaApi.sch_PrimitiveComponent.delete(oldComp.primitiveId);

				reconnectedWires++;
				details.push(`${oldComp.designator}: 替换成功`);
			} catch (e) {
				details.push(`${oldComp.designator}: 替换失败 - ${e}`);
				failedWires++;
			}
		}

		pinMappingModal?.hide();

		showResult({
			success: failedWires === 0,
			message: `替换完成: ${selectedComponents.length} 个元件`,
			reconnectedWires,
			failedWires,
			details,
		});
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		showResult({
			success: false,
			message: `替换失败: ${errorMsg}`,
			reconnectedWires: 0,
			failedWires: 0,
			details: [],
		});
	} finally {
		if (confirmBtn) {
			confirmBtn.disabled = false;
			confirmBtn.innerHTML = '确认替换';
		}
	}
}

function showResult(result: { success: boolean; message: string; reconnectedWires: number; failedWires: number; details: string[] }): void {
	const resultTitle = document.getElementById('resultTitle');
	const resultBody = document.getElementById('resultBody');

	if (resultTitle) {
		resultTitle.innerHTML = result.success
			? '<i class="bi bi-check-circle text-success"></i> 替换成功'
			: '<i class="bi bi-x-circle text-danger"></i> 替换失败';
	}

	if (resultBody) {
		resultBody.innerHTML = `
			<p>${result.message}</p>
			<div class="row g-2 mb-2">
				<div class="col-6">
					<div class="p-2 rounded text-center" style="background: rgba(0,184,148,0.2);">
						<div class="fs-4 text-success">${result.reconnectedWires}</div>
						<div class="small">替换成功</div>
					</div>
				</div>
				<div class="col-6">
					<div class="p-2 rounded text-center" style="background: rgba(225,112,85,0.2);">
						<div class="fs-4 text-danger">${result.failedWires}</div>
						<div class="small">替换失败</div>
					</div>
				</div>
			</div>
			${
				result.details.length > 0
					? `
				<div class="small text-muted">
					<strong>详细信息:</strong>
					<ul class="mt-1 mb-0 ps-3">
						${result.details
							.slice(0, 5)
							.map((d) => `<li>${d}</li>`)
							.join('')}
					</ul>
				</div>
			`
					: ''
			}
		`;
	}

	resultModal?.show();
}
