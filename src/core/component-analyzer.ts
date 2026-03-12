/**
 * Phoenix - 智能元件替换
 * 元件分析器
 * 负责获取和分析元件信息
 */

import type {
	ComponentState,
	PinState,
	WireConnection,
	WireState,
} from './types';

/**
 * 元件分析器类
 */
export class ComponentAnalyzer {
	/**
	 * 获取选中的元件
	 */
	async getSelectedComponent(): Promise<ComponentState | null> {
		try {
			// 获取选中的图元ID
			const selectedIds = await eda.sch_SelectControl.getSelectedPrimitives_PrimitiveId();

			if (!selectedIds || selectedIds.length === 0) {
				return null;
			}

			// 获取元件信息
			const component = await eda.sch_PrimitiveComponent.get(selectedIds[0]);

			if (!component) {
				return null;
			}

			return await this.extractComponentState(component);
		}
		catch (error) {
			console.error('获取选中元件失败:', error);
			return null;
		}
	}

	/**
	 * 提取元件状态信息
	 */
	async extractComponentState(component: ISCH_PrimitiveComponent): Promise<ComponentState> {
		const [
			primitiveId,
			name,
			designator,
			x,
			y,
			rotation,
			mirror,
			componentInfo,
			footprintInfo,
			uniqueId,
		] = await Promise.all([
			component.getState_PrimitiveId(),
			component.getState_Name(),
			component.getState_Designator(),
			component.getState_X(),
			component.getState_Y(),
			component.getState_Rotation(),
			component.getState_Mirror(),
			component.getState_Component(),
			component.getState_Footprint(),
			component.getState_UniqueId(),
		]);

		return {
			primitiveId,
			name: name ?? undefined,
			designator: designator ?? undefined,
			x,
			y,
			rotation,
			mirror,
			component: componentInfo,
			footprint: footprintInfo ?? undefined,
			uniqueId: uniqueId ?? undefined,
		};
	}

	/**
	 * 获取元件所有引脚信息
	 */
	async getComponentPins(componentId: string): Promise<PinState[]> {
		try {
			const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(componentId);

			const pinStates: PinState[] = [];

			for (const pin of pins) {
				const state = await this.extractPinState(pin);
				pinStates.push(state);
			}

			return pinStates;
		}
		catch (error) {
			console.error('获取引脚信息失败:', error);
			return [];
		}
	}

	/**
	 * 提取引脚状态信息
	 */
	async extractPinState(pin: ISCH_PrimitiveComponentPin): Promise<PinState> {
		const [
			pinNumber,
			pinName,
			x,
			y,
			rotation,
			pinLength,
			net,
		] = await Promise.all([
			pin.getState_PinNumber(),
			pin.getState_PinName(),
			pin.getState_X(),
			pin.getState_Y(),
			pin.getState_Rotation(),
			pin.getState_PinLength(),
			pin.getState_Net(),
		]);

		return {
			pinNumber,
			pinName,
			x,
			y,
			rotation,
			pinLength,
			net: net ?? undefined,
		};
	}

	/**
	 * 获取元件的网络连接信息
	 */
	async getWireConnections(componentId: string): Promise<WireConnection[]> {
		try {
			const pins = await this.getComponentPins(componentId);
			const allWires = await this.getAllWires();

			const connections: WireConnection[] = [];

			for (const pin of pins) {
				// 找到连接到该引脚的导线
				const connectedWires = this.findWiresNearPosition(
					allWires,
					{ x: pin.x, y: pin.y },
					15 // 15mil 容差
				);

				if (connectedWires.length > 0 || pin.net) {
					connections.push({
						netName: pin.net ?? '',
						pinNumber: pin.pinNumber,
						pinName: pin.pinName,
						position: { x: pin.x, y: pin.y },
						wireIds: connectedWires.map(w => w.primitiveId),
					});
				}
			}

			return connections;
		}
		catch (error) {
			console.error('获取网络连接信息失败:', error);
			return [];
		}
	}

	/**
	 * 获取所有导线
	 */
	async getAllWires(): Promise<WireState[]> {
		try {
			const wires = await eda.sch_PrimitiveWire.getAll();

			const wireStates: WireState[] = [];

			for (const wire of wires) {
				const [primitiveId, line, net] = await Promise.all([
					wire.getState_PrimitiveId(),
					wire.getState_Line(),
					wire.getState_Net(),
				]);

				wireStates.push({
					primitiveId,
					line: line as number[],
					net: net ?? undefined,
				});
			}

			return wireStates;
		}
		catch (error) {
			console.error('获取导线失败:', error);
			return [];
		}
	}

	/**
	 * 查找位置附近的导线
	 */
	findWiresNearPosition(
		wires: WireState[],
		position: { x: number; y: number },
		threshold: number
	): WireState[] {
		const result: WireState[] = [];

		for (const wire of wires) {
			const points = this.parseLinePoints(wire.line);

			// 检查端点是否接近指定位置
			for (let i = 0; i < points.length; i++) {
				// 只检查端点
				if (i === 0 || i === points.length - 1) {
					const distance = this.calculateDistance(points[i], position);
					if (distance <= threshold) {
						result.push(wire);
						break;
					}
				}
			}
		}

		return result;
	}

	/**
	 * 解析导线点
	 */
	parseLinePoints(line: number[]): { x: number; y: number }[] {
		// 导线格式可能是 [x1, y1, x2, y2, ...] 或 [[x1,y1], [x2,y2], ...]
		if (line.length === 0) {
			return [];
		}

		if (Array.isArray(line[0])) {
			// 嵌套数组格式
			return (line as unknown as number[][]).map(p => ({ x: p[0], y: p[1] }));
		}

		// 扁平数组格式
		const points: { x: number; y: number }[] = [];
		for (let i = 0; i < line.length; i += 2) {
			points.push({ x: line[i], y: line[i + 1] });
		}

		return points;
	}

	/**
	 * 计算两点距离
	 */
	calculateDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
		return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
	}

	/**
	 * 搜索元件
	 */
	async searchComponent(keyword: string): Promise<ComponentSearchResult[]> {
		try {
			// 使用库搜索API
			const results = await eda.lib_Device.search({
				keyword: keyword,
			});

			if (!results || results.length === 0) {
				return [];
			}

			return results.map(r => ({
				uuid: r.uuid,
				libraryUuid: r.libraryUuid ?? '',
				name: r.name ?? '',
				manufacturer: r.manufacturer,
				manufacturerId: r.manufacturerId,
				description: r.description,
			}));
		}
		catch (error) {
			console.error('搜索元件失败:', error);
			return [];
		}
	}

	/**
	 * 获取元件详细信息
	 */
	async getComponentDetail(libraryUuid: string, componentUuid: string): Promise<{
		name: string;
		pinCount: number;
		footprint?: string;
	} | null> {
		try {
			const device = await eda.lib_Device.get(componentUuid, libraryUuid);

			if (!device) {
				return null;
			}

			return {
				name: device.name ?? '',
				pinCount: device.pinCount ?? 0,
				footprint: device.footprint?.name,
			};
		}
		catch (error) {
			console.error('获取元件详情失败:', error);
			return null;
		}
	}
}

// 导出单例
export const componentAnalyzer = new ComponentAnalyzer();