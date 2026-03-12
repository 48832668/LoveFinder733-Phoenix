/**
 * Phoenix - 智能元件替换
 * 元件替换器
 * 负责执行元件替换的核心逻辑
 */

import type {
	ComponentState,
	ComponentDiff,
	PinMapping,
	ReplaceResult,
	ReplaceOptions,
	PinState,
	WireConnection,
} from './types';
import { ComponentAnalyzer, componentAnalyzer } from './component-analyzer';
import { PinMapper, pinMapper } from './pin-mapper';
import { WireReconnector, wireReconnector } from './wire-reconnector';

/**
 * 元件替换器类
 */
export class ComponentReplacer {
	private analyzer: ComponentAnalyzer;
	private mapper: PinMapper;
	private reconnector: WireReconnector;

	constructor() {
		this.analyzer = componentAnalyzer;
		this.mapper = pinMapper;
		this.reconnector = wireReconnector;
	}

	/**
	 * 分析元件差异
	 */
	async analyzeComponentDiff(
		oldComponent: ComponentState,
		newDeviceInfo: { libraryUuid: string; uuid: string; name: string }
	): Promise<ComponentDiff> {
		// 获取原元件引脚
		const oldPins = await this.analyzer.getComponentPins(oldComponent.primitiveId);

		// 获取网络连接信息
		const wireConnections = await this.analyzer.getWireConnections(oldComponent.primitiveId);

		// 获取新元件信息（需要先创建临时元件来获取引脚）
		// 这里简化处理，实际需要通过API获取新元件的符号信息
		const newPinCount = await this.estimatePinCount(newDeviceInfo);

		// 建立引脚映射
		const mappings = this.mapper.buildPinMappings(oldPins, [], wireConnections);

		// 获取未匹配的引脚
		const unmatched = this.mapper.getUnmatchedPins(oldPins, [], mappings);

		return {
			oldComponent,
			newComponent: newDeviceInfo,
			pinCountOld: oldPins.length,
			pinCountNew: newPinCount,
			pinMappings: mappings,
			unmatchedOldPins: unmatched.oldPins,
			unmatchedNewPins: unmatched.newPins,
			wireReconnectCount: mappings.filter(m => m.wireIds.length > 0).length,
			manualReconnectCount: mappings.filter(m => m.matchType === 'manual').length,
		};
	}

	/**
	 * 估算引脚数量
	 */
	private async estimatePinCount(deviceInfo: { libraryUuid: string; uuid: string }): Promise<number> {
		try {
			const detail = await this.analyzer.getComponentDetail(deviceInfo.libraryUuid, deviceInfo.uuid);
			return detail?.pinCount ?? 0;
		}
		catch {
			return 0;
		}
	}

	/**
	 * 执行元件替换
	 */
	async replaceComponent(
		oldComponent: ComponentState,
		newDeviceInfo: { libraryUuid: string; uuid: string },
		options: ReplaceOptions = {
			autoPinMapping: true,
			preserveAttributes: true,
			wireReconnectMode: 'smart',
			showPreview: true,
			highlightUnmatched: true,
		}
	): Promise<ReplaceResult> {
		const result: ReplaceResult = {
			success: false,
			message: '',
			reconnectedWires: 0,
			failedWires: 0,
			details: [],
		};

		try {
			// 1. 记录原元件信息
			const oldPins = await this.analyzer.getComponentPins(oldComponent.primitiveId);
			const wireConnections = await this.analyzer.getWireConnections(oldComponent.primitiveId);
			const allWires = await this.analyzer.getAllWires();

			result.details.push(`原元件: ${oldComponent.designator ?? oldComponent.name}`);
			result.details.push(`引脚数: ${oldPins.length}`);
			result.details.push(`网络连接: ${wireConnections.length}`);

			// 2. 创建新元件
			const newComponent = await this.createNewComponent(
				newDeviceInfo,
				oldComponent
			);

			if (!newComponent) {
				result.message = '创建新元件失败';
				return result;
			}

			result.details.push(`新元件已创建`);

			// 3. 获取新元件引脚
			const newPins = await this.analyzer.getComponentPins(newComponent.primitiveId);

			// 4. 建立引脚映射
			const mappings = this.mapper.buildPinMappings(oldPins, newPins, wireConnections);

			// 5. 验证映射
			const validation = this.mapper.validateMappings(mappings);
			if (!validation.isComplete && options.highlightUnmatched) {
				result.details.push(...validation.warnings);
			}

			// 6. 重连导线
			const reconnectResult = await this.reconnector.reconnectWires(mappings, allWires);
			result.reconnectedWires = reconnectResult.reconnectedWires;
			result.failedWires = reconnectResult.failedWires;
			result.details.push(...reconnectResult.details);

			// 7. 移动网络标签
			await this.reconnector.moveNetLabels(mappings);

			// 8. 删除原元件
			await eda.sch_PrimitiveComponent.delete(oldComponent.primitiveId);
			result.details.push(`原元件已删除`);

			// 9. 保留属性（如果需要）
			if (options.preserveAttributes && oldComponent.designator) {
				await this.preserveAttributes(newComponent.primitiveId, oldComponent);
			}

			result.success = true;
			result.message = `替换成功: ${oldComponent.designator ?? '元件'}`;
		}
		catch (error) {
			result.message = `替换失败: ${error}`;
			result.details.push(`错误: ${error}`);
		}

		return result;
	}

	/**
	 * 创建新元件
	 */
	private async createNewComponent(
		deviceInfo: { libraryUuid: string; uuid: string },
		oldComponent: ComponentState
	): Promise<ISCH_PrimitiveComponent | null> {
		try {
			// 获取器件文件
			const deviceFile = await eda.sys_FileManager.getDeviceFileByDeviceUuid(
				deviceInfo.uuid,
				deviceInfo.libraryUuid
			);

			if (!deviceFile) {
				console.error('无法获取器件文件');
				return null;
			}

			// 创建新元件，保持原位置和旋转
			const newComponent = await eda.sch_PrimitiveComponent.create(
				deviceFile,
				oldComponent.x,
				oldComponent.y,
				undefined, // subPartName
				oldComponent.rotation,
				oldComponent.mirror
			);

			return newComponent;
		}
		catch (error) {
			console.error('创建新元件失败:', error);
			return null;
		}
	}

	/**
	 * 保留原元件属性
	 */
	private async preserveAttributes(
		newComponentId: string,
		oldComponent: ComponentState
	): Promise<void> {
		try {
			const component = await eda.sch_PrimitiveComponent.get(newComponentId);
			if (component && oldComponent.designator) {
				await component.setState_Designator(oldComponent.designator);
				await component.done();
			}
		}
		catch (error) {
			console.error('保留属性失败:', error);
		}
	}

	/**
	 * 快速替换（不显示预览）
	 */
	async quickReplace(): Promise<ReplaceResult> {
		// 获取选中的元件
		const selectedComponent = await this.analyzer.getSelectedComponent();

		if (!selectedComponent) {
			return {
				success: false,
				message: '请先选中要替换的元件',
				reconnectedWires: 0,
				failedWires: 0,
				details: [],
			};
		}

		// 显示搜索对话框让用户选择新元件
		// 这里需要通过iframe界面来实现
		return {
			success: false,
			message: '请使用替换面板选择新元件',
			reconnectedWires: 0,
			failedWires: 0,
			details: ['选中元件:', selectedComponent.designator ?? selectedComponent.name ?? '未知'],
		};
	}

	/**
	 * 获取选中的元件信息（供前端使用）
	 */
	async getSelectedComponentInfo(): Promise<{
		component: ComponentState | null;
		pins: PinState[];
		connections: WireConnection[];
	}> {
		const component = await this.analyzer.getSelectedComponent();

		if (!component) {
			return {
				component: null,
				pins: [],
				connections: [],
			};
		}

		const pins = await this.analyzer.getComponentPins(component.primitiveId);
		const connections = await this.analyzer.getWireConnections(component.primitiveId);

		return {
			component,
			pins,
			connections,
		};
	}

	/**
	 * 搜索元件（供前端使用）
	 */
	async searchComponents(keyword: string): Promise<{
		uuid: string;
		libraryUuid: string;
		name: string;
		manufacturer?: string;
	}[]> {
		return await this.analyzer.searchComponent(keyword);
	}
}

// 导出单例
export const componentReplacer = new ComponentReplacer();