/**
 * Phoenix - 智能元件替换
 *
 * 功能：智能元件替换助手，支持引脚映射、导线自动重连、网络标签附着
 * 解决原版替换导线断开问题
 */
import * as extensionConfig from '../extension.json';
import { DataLoader, dataLoader } from './core/data-loader';
import type { PinMapping } from './core/types';
import { componentAnalyzer } from './core/component-analyzer';
import { pinMapper } from './core/pin-mapper';
import { wireReconnector } from './core/wire-reconnector';

// 状态管理
let isPanelOpen = false;

/**
 * 导出激活函数
 */
export function activate(_status?: 'onStartupFinished', _arg?: string): void {
	// 插件激活
}

/**
 * 打开替换面板
 */
export function openSwapperPanel(): void {
	if (isPanelOpen) {
		eda.sys_IFrame.showIFrame('phoenix-swapper-panel');
		return;
	}

	eda.sys_IFrame.openIFrame(
		'/iframe/index.html',
		900,
		500,
		'phoenix-swapper-panel',
		{
			maximizeButton: true,
			minimizeButton: true,
			grayscaleMask: false,
			buttonCallbackFn: (button: 'close' | 'minimize' | 'maximize') => {
				if (button === 'close') {
					isPanelOpen = false;
				}
			},
		},
	);

	isPanelOpen = true;
}

/**
 * 快速替换选中元件
 */
export async function quickReplaceComponent(): Promise<void> {
	eda.sys_Message.showToastMessage('请使用替换面板进行操作', ESYS_ToastMessageType.INFO, 3);
}

/**
 * 获取所有元件（供前端调用）
 */
export async function getAllComponents(): Promise<{
	success: boolean;
	components: Array<{
		primitiveId: string;
		designator: string;
		name: string;
		footprint: string;
		libraryUuid: string;
		componentUuid: string;
		manufacturer?: string;
		pinCount: number;
	}>;
	message?: string;
}> {
	return await DataLoader.getAllComponents();
}

/**
 * 搜索元件（供前端调用）
 */
export async function searchComponents(keyword: string): Promise<Array<{
	uuid: string;
	libraryUuid: string;
	name: string;
	footprint?: string;
	manufacturer?: string;
	description?: string;
	pinCount?: number;
}>> {
	if (!keyword || keyword.trim() === '') {
		return [];
	}

	try {
		const results = await eda.lib_Device.search({
			keyword: keyword.trim(),
		});

		if (!results || results.length === 0) {
			return [];
		}

		return results.slice(0, 50).map(r => ({
			uuid: r.uuid,
			libraryUuid: r.libraryUuid ?? '',
			name: r.name ?? '',
			footprint: r.footprint?.name,
			manufacturer: r.manufacturer,
			description: r.description,
			pinCount: r.pinCount,
		}));
	}
	catch (error) {
		console.error('搜索元件失败:', error);
		return [];
	}
}

/**
 * 分析引脚映射（供前端调用）
 */
export async function analyzePinMappings(
	selectedComponents: Array<{
		primitiveId: string;
		designator: string;
		name: string;
	}>,
	newDeviceInfo: {
		uuid: string;
		libraryUuid: string;
		name: string;
	}
): Promise<{
	success: boolean;
	mappings: PinMapping[];
	message?: string;
}> {
	try {
		if (!selectedComponents || selectedComponents.length === 0) {
			return {
				success: false,
				mappings: [],
				message: '未选择要替换的元件',
			};
		}

		// 获取第一个元件的引脚信息作为参考
		const firstComponent = selectedComponents[0];
		const oldPins = await componentAnalyzer.getComponentPins(firstComponent.primitiveId);
		const wireConnections = await componentAnalyzer.getWireConnections(firstComponent.primitiveId);

		// 建立基本映射
		const mappings: PinMapping[] = [];

		for (const oldPin of oldPins) {
			const connection = wireConnections.find(c => c.pinNumber === oldPin.pinNumber);

			mappings.push({
				oldPinNumber: oldPin.pinNumber,
				oldPinName: oldPin.pinName,
				newPinNumber: oldPin.pinNumber, // 默认相同编号
				newPinName: oldPin.pinName,
				netName: connection?.netName ?? oldPin.net ?? '',
				matchType: 'exact',
				oldPosition: { x: oldPin.x, y: oldPin.y },
				newPosition: { x: oldPin.x, y: oldPin.y },
				wireIds: connection?.wireIds ?? [],
			});
		}

		return {
			success: true,
			mappings,
		};
	}
	catch (error) {
		return {
			success: false,
			mappings: [],
			message: `分析引脚映射失败: ${error}`,
		};
	}
}

/**
 * 执行批量替换（供前端调用）
 */
export async function executeBatchReplace(
	selectedComponents: Array<{
		primitiveId: string;
		designator: string;
		name: string;
		libraryUuid: string;
		componentUuid: string;
	}>,
	newDeviceInfo: {
		uuid: string;
		libraryUuid: string;
		name: string;
	}
): Promise<{
	success: boolean;
	message: string;
	reconnectedWires: number;
	failedWires: number;
	details: string[];
}> {
	const result = {
		success: true,
		message: '',
		reconnectedWires: 0,
		failedWires: 0,
		details: [] as string[],
	};

	if (!selectedComponents || selectedComponents.length === 0) {
		result.success = false;
		result.message = '未选择要替换的元件';
		return result;
	}

	if (!newDeviceInfo || !newDeviceInfo.uuid) {
		result.success = false;
		result.message = '未选择新元件';
		return result;
	}

	try {
		eda.sys_Message.showToastMessage(
			`正在替换 ${selectedComponents.length} 个元件...`,
			ESYS_ToastMessageType.INFO,
			5
		);

		// 获取器件文件
		const deviceFile = await eda.sys_FileManager.getDeviceFileByDeviceUuid(
			newDeviceInfo.uuid,
			newDeviceInfo.libraryUuid
		);

		if (!deviceFile) {
			result.success = false;
			result.message = '无法获取新元件文件';
			return result;
		}

		// 逐个替换元件
		for (const oldComp of selectedComponents) {
			try {
				// 获取原元件信息
				const component = await eda.sch_PrimitiveComponent.get(oldComp.primitiveId);
				if (!component) {
					result.details.push(`${oldComp.designator}: 无法获取元件信息`);
					result.failedWires++;
					continue;
				}

				const [x, y, rotation, mirror, designator] = await Promise.all([
					component.getState_X(),
					component.getState_Y(),
					component.getState_Rotation(),
					component.getState_Mirror(),
					component.getState_Designator(),
				]);

				// 获取原元件的引脚和网络连接
				const oldPins = await componentAnalyzer.getComponentPins(oldComp.primitiveId);
				const wireConnections = await componentAnalyzer.getWireConnections(oldComp.primitiveId);
				const allWires = await componentAnalyzer.getAllWires();

				// 创建新元件
				const newComponent = await eda.sch_PrimitiveComponent.create(
					deviceFile,
					x,
					y,
					undefined,
					rotation,
					mirror
				);

				if (!newComponent) {
					result.details.push(`${oldComp.designator}: 创建新元件失败`);
					result.failedWires++;
					continue;
				}

				// 设置位号
				if (designator) {
					await newComponent.setState_Designator(designator);
					await newComponent.done();
				}

				// 获取新元件引脚
				const newPrimitiveId = await newComponent.getState_PrimitiveId();
				const newPins = await componentAnalyzer.getComponentPins(newPrimitiveId);

				// 建立引脚映射
				const mappings = pinMapper.buildPinMappings(oldPins, newPins, wireConnections);

				// 重连导线
				const reconnectResult = await wireReconnector.reconnectWires(mappings, allWires);
				result.reconnectedWires += reconnectResult.reconnectedWires;
				result.failedWires += reconnectResult.failedWires;

				// 删除原元件
				await eda.sch_PrimitiveComponent.delete(oldComp.primitiveId);

				result.details.push(`${oldComp.designator}: 替换成功`);
			}
			catch (e) {
				result.details.push(`${oldComp.designator}: 替换失败 - ${e}`);
				result.failedWires++;
			}
		}

		result.message = `替换完成: ${selectedComponents.length} 个元件, ${result.reconnectedWires} 根导线重连`;
		result.success = result.failedWires === 0;

		eda.sys_Message.showToastMessage(
			result.message,
			result.success ? ESYS_ToastMessageType.SUCCESS : ESYS_ToastMessageType.WARNING,
			5
		);
	}
	catch (error) {
		result.success = false;
		result.message = `替换失败: ${error}`;
		eda.sys_Message.showToastMessage(result.message, ESYS_ToastMessageType.ERROR, 5);
	}

	return result;
}

/**
 * 显示关于信息
 */
export function about(): void {
	eda.sys_Dialog.showInformationMessage(
		`Phoenix - 智能元件替换 v${extensionConfig.version}\n\n` +
		'功能：智能元件替换助手\n' +
		'• 引脚自动映射\n' +
		'• 导线自动重连\n' +
		'• 网络标签附着\n' +
		'• 批量替换支持\n\n' +
		'LoveFinderSeries NO.733',
		'关于 Phoenix',
	);
}