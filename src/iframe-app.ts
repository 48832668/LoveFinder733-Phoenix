/**
 * Phoenix - 智能元件替换
 * 前端应用逻辑
 */

// 类型定义
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
}

interface PinMapping {
	oldPinNumber: string;
	oldPinName: string;
	newPinNumber: string;
	newPinName: string;
	netName: string;
	matchType: 'exact' | 'name' | 'manual';
}

// 全局状态
let allComponents: ComponentItem[] = [];
let selectedComponents: ComponentItem[] = [];
let selectedNewComponent: SearchResult | null = null;
let currentPinMappings: PinMapping[] = [];

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
		this.log('info', `window.eda存在: ${typeof (window as any).eda !== 'undefined' ? '是' : '否'}`);
		this.log('info', `window.parent.eda存在: ${typeof (window.parent as any)?.eda !== 'undefined' ? '是' : '否'}`);
		this.log('info', `window.top.eda存在: ${typeof (window.top as any)?.eda !== 'undefined' ? '是' : '否'}`);
		
		// 检查 eda 的关键属性
		if (edaApi) {
			this.log('info', `eda.sys_IFrame存在: ${typeof edaApi.sys_IFrame !== 'undefined' ? '是' : '否'}`);
			this.log('info', `eda.sys_Message存在: ${typeof edaApi.sys_Message !== 'undefined' ? '是' : '否'}`);
			this.log('info', `eda.sch_PrimitiveComponent存在: ${typeof edaApi.sch_PrimitiveComponent !== 'undefined' ? '是' : '否'}`);
			this.log('info', `eda.dmt_SelectControl存在: ${typeof edaApi.dmt_SelectControl !== 'undefined' ? '是' : '否'}`);
			this.log('info', `eda.dmt_Schematic存在: ${typeof edaApi.dmt_Schematic !== 'undefined' ? '是' : '否'}`);
		}
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

		// 同时输出到控制台
		console.log(`[Phoenix ${level.toUpperCase()}] ${message}`);
	},

	info(message: string): void { this.log('info', message); },
	success(message: string): void { this.log('success', message); },
	warning(message: string): void { this.log('warning', message); },
	error(message: string): void { this.log('error', message); },

	clear(): void {
		if (this.logElement) {
			this.logElement.innerHTML = '';
		}
		this.log('info', '日志已清空');
	}
};

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', () => {
	DebugLog.init();
	DebugLog.info('DOMContentLoaded 事件触发');
	
	initModals();
	DebugLog.info('模态框初始化完成');
	
	initEventListeners();
	DebugLog.info('事件监听器初始化完成');
	
	DebugLog.info('页面初始化完成，等待用户操作');
});

/**
 * 初始化模态框
 */
function initModals(): void {
	try {
		const searchModalEl = document.getElementById('searchModal');
		const pinMappingModalEl = document.getElementById('pinMappingModal');
		const resultModalEl = document.getElementById('resultModal');

		if (searchModalEl) {
			searchModal = new bootstrap.Modal(searchModalEl);
			DebugLog.info('搜索模态框创建成功');
		}
		if (pinMappingModalEl) {
			pinMappingModal = new bootstrap.Modal(pinMappingModalEl);
			DebugLog.info('引脚映射模态框创建成功');
		}
		if (resultModalEl) {
			resultModal = new bootstrap.Modal(resultModalEl);
			DebugLog.info('结果模态框创建成功');
		}
	}
	catch (e) {
		DebugLog.error(`模态框初始化失败: ${e}`);
	}
}

/**
 * 初始化事件监听
 */
function initEventListeners(): void {
	// 调试面板折叠
	const debugHeader = document.getElementById('debugHeader');
	if (debugHeader) {
		debugHeader.addEventListener('click', () => {
			const content = document.getElementById('debugContent');
			const toggle = document.getElementById('debugToggle');
			if (content && toggle) {
				content.classList.toggle('show');
				toggle.textContent = content.classList.contains('show') ? '▼ 收起' : '▶ 展开';
			}
		});
	}

	// 清空日志
	const clearLogBtn = document.getElementById('clearLogBtn');
	if (clearLogBtn) {
		clearLogBtn.addEventListener('click', () => DebugLog.clear());
	}

	// 刷新按钮
	const refreshBtn = document.getElementById('refreshBtn');
	if (refreshBtn) {
		refreshBtn.addEventListener('click', () => {
			DebugLog.info('点击了刷新列表按钮');
			loadAllComponents();
		});
	}

	// 清空选择按钮
	const clearSelectionBtn = document.getElementById('clearSelectionBtn');
	if (clearSelectionBtn) {
		clearSelectionBtn.addEventListener('click', () => {
			DebugLog.info('点击了清空选择按钮');
			clearSelection();
		});
	}

	// 全选复选框
	const selectAll = document.getElementById('selectAll') as HTMLInputElement;
	if (selectAll) {
		selectAll.addEventListener('change', handleSelectAll);
	}

	// 筛选输入框
	const filterInput = document.getElementById('filterInput') as HTMLInputElement;
	if (filterInput) {
		filterInput.addEventListener('input', handleFilter);
	}

	// 选择新元件按钮
	const selectNewComponentBtn = document.getElementById('selectNewComponentBtn');
	if (selectNewComponentBtn) {
		selectNewComponentBtn.addEventListener('click', () => {
			DebugLog.info('点击了选择新元件按钮');
			openSearchModal();
		});
	}

	// 新元件搜索
	const newComponentSearch = document.getElementById('newComponentSearch') as HTMLInputElement;
	if (newComponentSearch) {
		newComponentSearch.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				DebugLog.info(`搜索关键词: ${newComponentSearch.value}`);
				searchNewComponents();
			}
		});
	}

	// 确认选择新元件
	const confirmNewComponentBtn = document.getElementById('confirmNewComponentBtn');
	if (confirmNewComponentBtn) {
		confirmNewComponentBtn.addEventListener('click', () => {
			DebugLog.info('确认选择新元件');
			confirmNewComponentSelection();
		});
	}

	// 执行替换按钮
	const executeReplaceBtn = document.getElementById('executeReplaceBtn');
	if (executeReplaceBtn) {
		executeReplaceBtn.addEventListener('click', () => {
			DebugLog.info('点击了执行替换按钮');
			openPinMappingModal();
		});
	}

	// 确认替换按钮
	const confirmReplaceBtn = document.getElementById('confirmReplaceBtn');
	if (confirmReplaceBtn) {
		confirmReplaceBtn.addEventListener('click', () => {
			DebugLog.info('确认执行替换');
			executeReplace();
		});
	}
}

/**
 * 显示 Toast 消息
 */
function showToast(msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): void {
	if (edaApi?.sys_Message) {
		const t = {
			success: (window as any).ESYS_ToastMessageType?.SUCCESS,
			error: (window as any).ESYS_ToastMessageType?.ERROR,
			warning: (window as any).ESYS_ToastMessageType?.WARNING,
		}[type] || (window as any).ESYS_ToastMessageType?.INFO;
		try {
			edaApi.sys_Message.showToastMessage(msg, t, 3);
		}
		catch (e) {
			console.error('Toast failed:', e);
		}
	}
}

/**
 * 读取状态属性（优先方法，其次字段）
 */
function readState<T>(target: unknown, methodName: string, fieldNames: string[]): T | undefined {
	if (!target || typeof target !== 'object')
		return undefined;
	
	// 尝试方法
	const method = (target as Record<string, unknown>)[methodName];
	if (typeof method === 'function') {
		try {
			return (method as () => T).call(target);
		}
		catch {}
	}
	
	// 尝试字段
	for (const fieldName of fieldNames) {
		if (fieldName in (target as Record<string, unknown>)) {
			return (target as Record<string, T | undefined>)[fieldName];
		}
	}
	return undefined;
}

/**
 * 加载所有元件 - 直接使用 EDA API
 */
async function loadAllComponents(): Promise<void> {
	DebugLog.info('开始加载元件列表...');
	
	const tbody = document.getElementById('componentListBody');
	const totalCount = document.getElementById('totalCount');

	if (!tbody) {
		DebugLog.error('找不到 componentListBody 元素');
		return;
	}

	tbody.innerHTML = `
		<tr>
			<td colspan="4" class="text-center">
				<div class="loading">
					<div class="loading-spinner"></div>
					<div class="mt-2">加载中...</div>
				</div>
			</td>
		</tr>
	`;

	// 检查 EDA API 是否可用
	if (!edaApi) {
		DebugLog.error('EDA API 不可用，eda 对象未定义');
		tbody.innerHTML = `
			<tr>
				<td colspan="4" class="text-center text-danger">EDA API 不可用</td>
			</tr>
		`;
		return;
	}

	DebugLog.info('EDA API 可用，开始获取元件...');

	try {
		// 检查当前文档是否为原理图
		const currentDoc = await edaApi.dmt_SelectControl.getCurrentDocumentInfo();
		DebugLog.info(`当前文档类型: ${currentDoc?.documentType}`);
		
		if (!currentDoc || currentDoc.documentType !== 1) {
			DebugLog.warning('当前文档不是原理图');
			tbody.innerHTML = `
				<tr>
					<td colspan="4" class="text-center text-muted">当前文档不是原理图，请打开原理图后再试</td>
				</tr>
			`;
			showToast('请先打开原理图文档', 'warning');
			return;
		}

		// 获取所有图页
		const allPages = await edaApi.dmt_Schematic.getCurrentSchematicAllSchematicPagesInfo();
		DebugLog.info(`找到 ${allPages?.length || 0} 个图页`);
		
		if (!allPages || allPages.length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="4" class="text-center text-muted">未找到图页</td>
				</tr>
			`;
			return;
		}

		// 获取当前图页 UUID（用于恢复）
		const currentPage = await edaApi.dmt_Schematic.getCurrentSchematicPageInfo();
		const originalPageUuid = currentPage?.uuid;
		DebugLog.info(`当前图页: ${currentPage?.name || '未知'}`);

		allComponents = [];

		// 遍历所有图页
		for (let i = 0; i < allPages.length; i++) {
			const page = allPages[i];
			DebugLog.info(`正在扫描图页 ${i + 1}/${allPages.length}: ${page.name}`);
			
			try {
				// 切换到该图页
				await edaApi.dmt_EditorControl.openDocument(page.uuid);
				await new Promise(r => setTimeout(r, 100));

				// 获取该图页的所有元件
				const comps = await edaApi.sch_PrimitiveComponent.getAll();
				DebugLog.info(`图页 ${page.name} 找到 ${comps?.length || 0} 个元件`);

				for (const comp of comps || []) {
					try {
						// 过滤：只保留真正的元件（排除图纸等）
						const primitiveType = readState<string>(comp, 'getState_PrimitiveType', ['primitiveType']);
						const componentType = readState<string>(comp, 'getState_ComponentType', ['componentType']);

						// 检查是否为真正的元件
						const isRealComponent = primitiveType === (window as any).ESCH_PrimitiveType?.COMPONENT
							&& componentType === (window as any).ESCH_PrimitiveComponentType?.COMPONENT;

						if (!isRealComponent) {
							DebugLog.info(`跳过非元件对象: primitiveType=${primitiveType}, componentType=${componentType}`);
							continue;
						}

						const primitiveId = readState<string>(comp, 'getState_PrimitiveId', ['primitiveId']) || '';
						if (!primitiveId) continue;

						const designator = readState<string>(comp, 'getState_Designator', ['designator']) || '?';
						
						// 优先使用 manufacturerId（元件型号）
						let name = '';
						if (comp && typeof comp === 'object' && 'manufacturerId' in comp) {
							const manufacturerId = (comp as Record<string, unknown>).manufacturerId;
							if (typeof manufacturerId === 'string') {
								name = manufacturerId;
							}
						}
						if (!name) {
							name = readState<string>(comp, 'getState_Name', ['name']) || '未知';
						}

						const componentInfo = readState<{ libraryUuid: string; uuid: string }>(comp, 'getState_Component', ['component']);
						const footprintInfo = readState<{ libraryUuid: string; uuid: string }>(comp, 'getState_Footprint', ['footprint']);
						const manufacturer = readState<string>(comp, 'getState_Manufacturer', ['manufacturer']);

						// 获取引脚数量
						let pinCount = 0;
						try {
							const pins = await edaApi.sch_PrimitiveComponent.getAllPinsByPrimitiveId(primitiveId);
							pinCount = pins?.length || 0;
						}
						catch {}

						allComponents.push({
							primitiveId,
							designator,
							name,
							footprint: footprintInfo?.uuid || '-',
							libraryUuid: componentInfo?.libraryUuid || '',
							componentUuid: componentInfo?.uuid || '',
							manufacturer: manufacturer || undefined,
							pinCount,
						});
					}
					catch (e) {
						DebugLog.warning(`解析元件失败: ${e}`);
					}
				}
			}
			catch (e) {
				DebugLog.warning(`扫描图页 ${page.name} 失败: ${e}`);
			}
		}

		// 恢复到原来的图页
		if (originalPageUuid) {
			try {
				await edaApi.dmt_EditorControl.openDocument(originalPageUuid);
			}
			catch {}
		}

		DebugLog.success(`成功加载 ${allComponents.length} 个元件`);
		renderComponentList(allComponents);
		
		if (totalCount) {
			totalCount.textContent = String(allComponents.length);
		}
		
		showToast(`加载完成: ${allComponents.length} 个元件`, 'success');
	}
	catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		DebugLog.error(`加载失败: ${errorMsg}`);
		tbody.innerHTML = `
			<tr>
				<td colspan="4" class="text-center text-danger">
					加载失败: ${errorMsg}
				</td>
			</tr>
		`;
		showToast(`加载失败: ${errorMsg}`, 'error');
	}
}

/**
 * 渲染元件列表
 */
function renderComponentList(components: ComponentItem[]): void {
	const tbody = document.getElementById('componentListBody');
	if (!tbody) {
		DebugLog.error('找不到 componentListBody');
		return;
	}

	if (components.length === 0) {
		tbody.innerHTML = `
			<tr>
				<td colspan="4" class="text-center text-muted">暂无元件</td>
			</tr>
		`;
		return;
	}

	tbody.innerHTML = components.map(comp => `
		<tr data-primitive-id="${comp.primitiveId}">
			<td>${comp.designator || '?'}</td>
			<td>${comp.name || '-'}</td>
			<td>${comp.footprint || '-'}</td>
			<td class="text-center">
				<input type="checkbox" class="component-checkbox"
					data-primitive-id="${comp.primitiveId}"
					${selectedComponents.some(s => s.primitiveId === comp.primitiveId) ? 'checked' : ''}>
			</td>
		</tr>
	`).join('');

	// 绑定复选框事件
	const checkboxes = tbody.querySelectorAll('.component-checkbox');
	checkboxes.forEach(checkbox => {
		checkbox.addEventListener('change', handleComponentSelect);
	});
	
	DebugLog.info(`渲染了 ${components.length} 个元件行`);
}

/**
 * 处理元件选择
 */
function handleComponentSelect(event: Event): void {
	const checkbox = event.target as HTMLInputElement;
	const primitiveId = checkbox.dataset.primitiveId;
	const row = checkbox.closest('tr');

	if (!primitiveId) return;

	const component = allComponents.find(c => c.primitiveId === primitiveId);
	if (!component) return;

	if (checkbox.checked) {
		if (!selectedComponents.some(s => s.primitiveId === primitiveId)) {
			selectedComponents.push(component);
		}
		if (row) row.classList.add('selected-row');
		DebugLog.info(`选中元件: ${component.designator}`);
	}
	else {
		selectedComponents = selectedComponents.filter(s => s.primitiveId !== primitiveId);
		if (row) row.classList.remove('selected-row');
		DebugLog.info(`取消选中: ${component.designator}`);
	}

	renderSelectedList();
	updateButtonStates();
}

/**
 * 渲染已选中列表
 */
function renderSelectedList(): void {
	const tbody = document.getElementById('selectedListBody');
	const selectedCount = document.getElementById('selectedCount');

	if (!tbody) return;

	if (selectedCount) {
		selectedCount.textContent = String(selectedComponents.length);
	}

	if (selectedComponents.length === 0) {
		tbody.innerHTML = `
			<tr>
				<td colspan="3" class="text-center text-muted">暂无选中</td>
			</tr>
		`;
		return;
	}

	tbody.innerHTML = selectedComponents.map(comp => `
		<tr>
			<td>${comp.designator || '?'}</td>
			<td>${comp.name || '-'}</td>
			<td class="text-center">
				<button class="btn btn-sm btn-outline-danger remove-btn" data-primitive-id="${comp.primitiveId}">
					<i class="bi bi-x"></i>
				</button>
			</td>
		</tr>
	`).join('');

	const removeBtns = tbody.querySelectorAll('.remove-btn');
	removeBtns.forEach(btn => {
		btn.addEventListener('click', handleRemoveComponent);
	});
}

/**
 * 处理移除元件
 */
function handleRemoveComponent(event: Event): void {
	const btn = event.currentTarget as HTMLButtonElement;
	const primitiveId = btn.dataset.primitiveId;
	if (!primitiveId) return;

	selectedComponents = selectedComponents.filter(s => s.primitiveId !== primitiveId);

	const checkbox = document.querySelector(`.component-checkbox[data-primitive-id="${primitiveId}"]`) as HTMLInputElement;
	if (checkbox) {
		checkbox.checked = false;
		const row = checkbox.closest('tr');
		if (row) row.classList.remove('selected-row');
	}

	renderSelectedList();
	updateButtonStates();
}

/**
 * 处理全选
 */
function handleSelectAll(event: Event): void {
	const selectAllCheckbox = event.target as HTMLInputElement;
	const checkboxes = document.querySelectorAll('.component-checkbox') as NodeListOf<HTMLInputElement>;

	checkboxes.forEach(checkbox => {
		checkbox.checked = selectAllCheckbox.checked;
		const primitiveId = checkbox.dataset.primitiveId;
		const row = checkbox.closest('tr');

		if (primitiveId) {
			const component = allComponents.find(c => c.primitiveId === primitiveId);
			if (component) {
				if (selectAllCheckbox.checked) {
					if (!selectedComponents.some(s => s.primitiveId === primitiveId)) {
						selectedComponents.push(component);
					}
					if (row) row.classList.add('selected-row');
				}
				else {
					selectedComponents = selectedComponents.filter(s => s.primitiveId !== primitiveId);
					if (row) row.classList.remove('selected-row');
				}
			}
		}
	});

	renderSelectedList();
	updateButtonStates();
	DebugLog.info(selectAllCheckbox.checked ? '全选所有元件' : '取消全选');
}

/**
 * 处理筛选
 */
function handleFilter(event: Event): void {
	const input = event.target as HTMLInputElement;
	const keyword = input.value.toLowerCase().trim();

	if (!keyword) {
		renderComponentList(allComponents);
		return;
	}

	const filtered = allComponents.filter(comp =>
		(comp.designator || '').toLowerCase().includes(keyword) ||
		(comp.name || '').toLowerCase().includes(keyword) ||
		(comp.footprint || '').toLowerCase().includes(keyword)
	);

	renderComponentList(filtered);
}

/**
 * 清空选择
 */
function clearSelection(): void {
	selectedComponents = [];
	selectedNewComponent = null;

	const checkboxes = document.querySelectorAll('.component-checkbox') as NodeListOf<HTMLInputElement>;
	checkboxes.forEach(checkbox => {
		checkbox.checked = false;
		const row = checkbox.closest('tr');
		if (row) row.classList.remove('selected-row');
	});

	const selectAll = document.getElementById('selectAll') as HTMLInputElement;
	if (selectAll) selectAll.checked = false;

	renderSelectedList();
	clearComparePanel();
	updateButtonStates();
	DebugLog.info('已清空所有选择');
}

/**
 * 清空对比面板
 */
function clearComparePanel(): void {
	const fields = ['Model', 'Footprint', 'Pins', 'Manufacturer', 'Supplier'];
	fields.forEach(field => {
		const oldEl = document.getElementById(`old${field}`);
		const newEl = document.getElementById(`new${field}`);
		if (oldEl) oldEl.textContent = '-';
		if (newEl) newEl.textContent = '-';
	});
}

/**
 * 更新按钮状态
 */
function updateButtonStates(): void {
	const selectNewComponentBtn = document.getElementById('selectNewComponentBtn') as HTMLButtonElement;
	const executeReplaceBtn = document.getElementById('executeReplaceBtn') as HTMLButtonElement;

	if (selectNewComponentBtn) {
		selectNewComponentBtn.disabled = selectedComponents.length === 0;
	}

	if (executeReplaceBtn) {
		executeReplaceBtn.disabled = selectedComponents.length === 0 || !selectedNewComponent;
	}
}

/**
 * 打开搜索模态框
 */
function openSearchModal(): void {
	if (searchModal) {
		searchModal.show();
		DebugLog.info('打开搜索模态框');
	}
}

/**
 * 搜索新元件
 */
async function searchNewComponents(): Promise<void> {
	const searchInput = document.getElementById('newComponentSearch') as HTMLInputElement;
	const tbody = document.getElementById('searchResultsBody');

	if (!searchInput || !tbody) return;

	const keyword = searchInput.value.trim();
	if (!keyword) {
		tbody.innerHTML = `
			<tr>
				<td colspan="5" class="text-center text-muted">输入关键词搜索元件</td>
			</tr>
		`;
		return;
	}

	DebugLog.info(`搜索元件: ${keyword}`);
	tbody.innerHTML = `
		<tr>
			<td colspan="5" class="text-center">
				<div class="loading">
					<div class="loading-spinner"></div>
				</div>
			</td>
		</tr>
	`;

	try {
		const results = await edaApi.lib_Device.search({
			keyword: keyword.trim(),
		});

		DebugLog.info(`搜索返回 ${results?.length || 0} 个结果`);

		if (!results || results.length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="5" class="text-center text-muted">未找到匹配的元件</td>
				</tr>
			`;
			return;
		}

		tbody.innerHTML = results.slice(0, 50).map((r: any, index: number) => `
			<tr class="search-result-row" data-index="${index}">
				<td>${r.name || '-'}</td>
				<td>${r.footprint?.name || '-'}</td>
				<td>${r.manufacturer || '-'}</td>
				<td>${r.description || '-'}</td>
				<td class="text-center">
					<input type="radio" name="searchResult" value="${index}">
				</td>
			</tr>
		`).join('');

		const rows = tbody.querySelectorAll('.search-result-row');
		rows.forEach(row => {
			row.addEventListener('click', () => {
				const radio = row.querySelector('input[type="radio"]') as HTMLInputElement;
				if (radio) {
					radio.checked = true;
					rows.forEach(r => r.classList.remove('highlight-row'));
					row.classList.add('highlight-row');
					const index = parseInt(radio.value);
					const r = results[index];
					selectedNewComponent = {
						uuid: r.uuid,
						libraryUuid: r.libraryUuid || '',
						name: r.name || '',
						footprint: r.footprint?.name,
						manufacturer: r.manufacturer,
						description: r.description,
						pinCount: r.pinCount,
					};
					DebugLog.info(`选中搜索结果: ${selectedNewComponent.name}`);
					const confirmBtn = document.getElementById('confirmNewComponentBtn') as HTMLButtonElement;
					if (confirmBtn) confirmBtn.disabled = false;
				}
			});
		});
	}
	catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		DebugLog.error(`搜索失败: ${errorMsg}`);
		tbody.innerHTML = `
			<tr>
				<td colspan="5" class="text-center text-danger">搜索失败: ${errorMsg}</td>
			</tr>
		`;
	}
}

/**
 * 确认新元件选择
 */
function confirmNewComponentSelection(): void {
	if (!selectedNewComponent) return;

	updateComparePanel();

	if (searchModal) {
		searchModal.hide();
	}

	updateButtonStates();
	DebugLog.success(`已选择新元件: ${selectedNewComponent.name}`);
}

/**
 * 更新对比面板
 */
function updateComparePanel(): void {
	if (!selectedNewComponent || selectedComponents.length === 0) return;

	const firstComponent = selectedComponents[0];

	const oldModel = document.getElementById('oldModel');
	const oldFootprint = document.getElementById('oldFootprint');
	const oldPins = document.getElementById('oldPins');
	const oldManufacturer = document.getElementById('oldManufacturer');

	if (oldModel) oldModel.textContent = firstComponent.name || '-';
	if (oldFootprint) oldFootprint.textContent = firstComponent.footprint || '-';
	if (oldPins) oldPins.textContent = String(firstComponent.pinCount || '-');
	if (oldManufacturer) oldManufacturer.textContent = firstComponent.manufacturer || '-';

	const newModel = document.getElementById('newModel');
	const newFootprint = document.getElementById('newFootprint');
	const newPins = document.getElementById('newPins');
	const newManufacturer = document.getElementById('newManufacturer');

	if (newModel) newModel.textContent = selectedNewComponent.name || '-';
	if (newFootprint) newFootprint.textContent = selectedNewComponent.footprint || '-';
	if (newPins) newPins.textContent = String(selectedNewComponent.pinCount || '-');
	if (newManufacturer) newManufacturer.textContent = selectedNewComponent.manufacturer || '-';
}

/**
 * 打开引脚映射模态框
 */
async function openPinMappingModal(): Promise<void> {
	if (!selectedNewComponent || selectedComponents.length === 0) return;

	const tbody = document.getElementById('pinMappingBody');
	if (!tbody) return;

	tbody.innerHTML = `
		<tr>
			<td colspan="7" class="text-center">
				<div class="loading">
					<div class="loading-spinner"></div>
					<div class="mt-2">分析引脚映射中...</div>
				</div>
			</td>
		</tr>
	`;

	if (pinMappingModal) {
		pinMappingModal.show();
	}

	try {
		// 获取第一个元件的引脚信息
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
		DebugLog.success(`引脚映射分析完成，共 ${mappings.length} 个引脚`);
	}
	catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		DebugLog.error(`分析失败: ${errorMsg}`);
		tbody.innerHTML = `
			<tr>
				<td colspan="7" class="text-center text-danger">
					分析失败: ${errorMsg}
				</td>
			</tr>
		`;
	}
}

/**
 * 渲染引脚映射
 */
function renderPinMappings(mappings: PinMapping[]): void {
	const tbody = document.getElementById('pinMappingBody');
	if (!tbody) return;

	if (mappings.length === 0) {
		tbody.innerHTML = `
			<tr>
				<td colspan="7" class="text-center text-muted">暂无映射数据</td>
			</tr>
		`;
		return;
	}

	tbody.innerHTML = mappings.map(m => `
		<tr>
			<td>${m.oldPinNumber}</td>
			<td>${m.oldPinName}</td>
			<td class="text-info">${m.netName || '-'}</td>
			<td>→</td>
			<td>${m.newPinNumber}</td>
			<td>${m.newPinName}</td>
			<td><span class="match-badge match-${m.matchType}">${m.matchType}</span></td>
		</tr>
	`).join('');
}

/**
 * 执行替换
 */
async function executeReplace(): Promise<void> {
	if (!selectedNewComponent || selectedComponents.length === 0) return;

	const confirmBtn = document.getElementById('confirmReplaceBtn') as HTMLButtonElement;
	if (confirmBtn) {
		confirmBtn.disabled = true;
		confirmBtn.innerHTML = '<span class="loading-spinner"></span> 替换中...';
	}

	DebugLog.info(`开始执行替换，共 ${selectedComponents.length} 个元件`);
	showToast(`正在替换 ${selectedComponents.length} 个元件...`, 'info');

	try {
		// 获取器件文件
		const deviceFile = await edaApi.sys_FileManager.getDeviceFileByDeviceUuid(
			selectedNewComponent.uuid,
			selectedNewComponent.libraryUuid
		);

		if (!deviceFile) {
			throw new Error('无法获取新元件文件');
		}

		let reconnectedWires = 0;
		let failedWires = 0;
		const details: string[] = [];

		// 逐个替换元件
		for (const oldComp of selectedComponents) {
			try {
				// 获取原元件信息
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

				// 创建新元件
				const newComponent = await edaApi.sch_PrimitiveComponent.create(
					deviceFile,
					x,
					y,
					undefined,
					rotation,
					mirror
				);

				if (!newComponent) {
					details.push(`${oldComp.designator}: 创建新元件失败`);
					failedWires++;
					continue;
				}

				// 设置位号
				if (designator) {
					await newComponent.setState_Designator(designator);
					await newComponent.done();
				}

				// 删除原元件
				await edaApi.sch_PrimitiveComponent.delete(oldComp.primitiveId);

				reconnectedWires++;
				details.push(`${oldComp.designator}: 替换成功`);
			}
			catch (e) {
				details.push(`${oldComp.designator}: 替换失败 - ${e}`);
				failedWires++;
			}
		}

		const success = failedWires === 0;
		const message = `替换完成: ${selectedComponents.length} 个元件`;

		if (pinMappingModal) {
			pinMappingModal.hide();
		}

		showResult({
			success,
			message,
			reconnectedWires,
			failedWires,
			details,
		});
		
		DebugLog.success(message);
	}
	catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		DebugLog.error(`替换失败: ${errorMsg}`);
		showResult({
			success: false,
			message: `替换失败: ${errorMsg}`,
			reconnectedWires: 0,
			failedWires: 0,
			details: []
		});
	}
	finally {
		if (confirmBtn) {
			confirmBtn.disabled = false;
			confirmBtn.innerHTML = '确认替换';
		}
	}
}

/**
 * 显示结果
 */
function showResult(result: {
	success: boolean;
	message: string;
	reconnectedWires: number;
	failedWires: number;
	details: string[];
}): void {
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
			${result.details.length > 0 ? `
				<div class="small text-muted">
					<strong>详细信息:</strong>
					<ul class="mt-1 mb-0 ps-3">
						${result.details.slice(0, 5).map(d => `<li>${d}</li>`).join('')}
					</ul>
				</div>
			` : ''}
		`;
	}

	if (resultModal) {
		resultModal.show();
	}

	if (result.success) {
		setTimeout(() => {
			clearSelection();
			loadAllComponents();
		}, 1000);
	}
}