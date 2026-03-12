/**
 * Phoenix - 智能元件替换
 * 导线重连器
 * 负责处理元件替换后的导线重连
 */

import type { PinMapping, WireState, ReplaceResult } from './types';

/**
 * 导线重连器类
 */
export class WireReconnector {
	/**
	 * 重连所有导线
	 */
	async reconnectWires(
		mappings: PinMapping[],
		allWires: WireState[]
	): Promise<ReplaceResult> {
		const result: ReplaceResult = {
			success: true,
			message: '',
			reconnectedWires: 0,
			failedWires: 0,
			details: [],
		};

		for (const mapping of mappings) {
			if (mapping.wireIds.length === 0) {
				continue;
			}

			for (const wireId of mapping.wireIds) {
				try {
					const wire = allWires.find(w => w.primitiveId === wireId);
					if (!wire) {
						result.failedWires++;
						result.details.push(`导线 ${wireId} 未找到`);
						continue;
					}

					// 计算新的导线路径
					const newLine = this.recalculateWirePath(
						wire.line,
						mapping.oldPosition,
						mapping.newPosition
					);

					// 修改导线
					await eda.sch_PrimitiveWire.modify(wireId, {
						line: newLine,
						net: mapping.netName || wire.net,
					});

					result.reconnectedWires++;
					result.details.push(`引脚 ${mapping.oldPinNumber} → ${mapping.newPinNumber}: 导线重连成功`);
				}
				catch (error) {
					result.failedWires++;
					result.details.push(`引脚 ${mapping.oldPinNumber}: 导线重连失败 - ${error}`);
				}
			}
		}

		result.message = `重连完成: ${result.reconnectedWires} 成功, ${result.failedWires} 失败`;
		result.success = result.failedWires === 0;

		return result;
	}

	/**
	 * 重新计算导线路径
	 */
	recalculateWirePath(
		originalLine: number[],
		oldPinPos: { x: number; y: number },
		newPinPos: { x: number; y: number }
	): number[] {
		const points = this.parseLinePoints(originalLine);

		if (points.length < 2) {
			// 导线点数不足，创建直线
			return [newPinPos.x, newPinPos.y, newPinPos.x + 100, newPinPos.y];
		}

		// 找到需要移动的端点
		const threshold = 20; // 20mil 容差
		const newPoints = points.map((point, index) => {
			// 只处理端点
			if (index === 0 || index === points.length - 1) {
				const distance = this.calculateDistance(point, oldPinPos);
				if (distance <= threshold) {
					return newPinPos;
				}
			}
			return point;
		});

		// 检查是否需要重新生成路径（方向完全改变）
		const needsRegeneration = this.checkDirectionChange(points, oldPinPos, newPinPos);

		if (needsRegeneration) {
			return this.generateNewWirePath(oldPinPos, newPinPos);
		}

		return this.flattenPoints(newPoints);
	}

	/**
	 * 解析导线点
	 */
	parseLinePoints(line: number[]): { x: number; y: number }[] {
		if (line.length === 0) {
			return [];
		}

		if (Array.isArray(line[0])) {
			return (line as unknown as number[][]).map(p => ({ x: p[0], y: p[1] }));
		}

		const points: { x: number; y: number }[] = [];
		for (let i = 0; i < line.length; i += 2) {
			points.push({ x: line[i], y: line[i + 1] });
		}

		return points;
	}

	/**
	 * 将点数组扁平化
	 */
	flattenPoints(points: { x: number; y: number }[]): number[] {
		const result: number[] = [];
		for (const p of points) {
			result.push(p.x, p.y);
		}
		return result;
	}

	/**
	 * 计算两点距离
	 */
	calculateDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
		return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
	}

	/**
	 * 检查是否需要重新生成路径
	 */
	checkDirectionChange(
		points: { x: number; y: number }[],
		oldPos: { x: number; y: number },
		newPos: { x: number; y: number }
	): boolean {
		if (points.length < 2) {
			return true;
		}

		// 计算原导线方向
		const startPoint = points[0];
		const endPoint = points[points.length - 1];

		// 判断哪个端点连接到旧引脚
		const connectedToEnd = this.calculateDistance(endPoint, oldPos) < 20;

		if (connectedToEnd) {
			// 检查方向变化
			const oldDir = this.getDirection(startPoint, endPoint);
			const newDir = this.getDirection(startPoint, newPos);

			// 如果方向变化超过90度，需要重新生成
			return Math.abs(oldDir - newDir) > 45;
		}

		return false;
	}

	/**
	 * 获取方向角度
	 */
	getDirection(from: { x: number; y: number }, to: { x: number; y: number }): number {
		return Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
	}

	/**
	 * 生成新的导线路径
	 */
	generateNewWirePath(
		oldPos: { x: number; y: number },
		newPos: { x: number; y: number }
	): number[] {
		const dx = newPos.x - oldPos.x;
		const dy = newPos.y - oldPos.y;

		// 如果新引脚在原引脚的某个方向，创建直线
		if (Math.abs(dx) < 10 || Math.abs(dy) < 10) {
			return [oldPos.x, oldPos.y, newPos.x, newPos.y];
		}

		// 创建L形导线
		// 选择较短的路径
		const midPoint1 = { x: newPos.x, y: oldPos.y };
		const midPoint2 = { x: oldPos.x, y: newPos.y };

		// 选择更合理的转角方向
		const path1Length = Math.abs(newPos.x - oldPos.x) + Math.abs(newPos.y - oldPos.y);

		if (path1Length > 0) {
			// 优先水平后垂直
			return [
				oldPos.x, oldPos.y,
				midPoint1.x, midPoint1.y,
				newPos.x, newPos.y,
			];
		}

		return [
			oldPos.x, oldPos.y,
			midPoint2.x, midPoint2.y,
			newPos.x, newPos.y,
		];
	}

	/**
	 * 创建延伸导线
	 */
	async createExtensionWire(
		pinPos: { x: number; y: number },
		netName: string,
		direction: 'left' | 'right' | 'up' | 'down' = 'right',
		length: number = 100
	): Promise<string | null> {
		try {
			let endPoint: { x: number; y: number };

			switch (direction) {
				case 'left':
					endPoint = { x: pinPos.x - length, y: pinPos.y };
					break;
				case 'right':
					endPoint = { x: pinPos.x + length, y: pinPos.y };
					break;
				case 'up':
					endPoint = { x: pinPos.x, y: pinPos.y - length };
					break;
				case 'down':
					endPoint = { x: pinPos.x, y: pinPos.y + length };
					break;
			}

			const wire = await eda.sch_PrimitiveWire.create(
				[pinPos.x, pinPos.y, endPoint.x, endPoint.y],
				netName
			);

			return wire ? await wire.getState_PrimitiveId() : null;
		}
		catch (error) {
			console.error('创建延伸导线失败:', error);
			return null;
		}
	}

	/**
	 * 移动网络标签
	 */
	async moveNetLabels(
		mappings: PinMapping[]
	): Promise<void> {
		try {
			// 获取所有文本图元
			const texts = await eda.sch_PrimitiveText.getAll();

			for (const mapping of mappings) {
				if (!mapping.netName) {
					continue;
				}

				// 找到该网络的标签
				for (const text of texts) {
					const textContent = await text.getState_Text();
					if (textContent === mapping.netName) {
						// 计算新位置
						const newPos = this.calculateLabelPosition(mapping.newPosition);
						await eda.sch_PrimitiveText.modify(text.primitiveId, {
							x: newPos.x,
							y: newPos.y,
						});
					}
				}
			}
		}
		catch (error) {
			console.error('移动网络标签失败:', error);
		}
	}

	/**
	 * 计算网络标签位置
	 */
	calculateLabelPosition(pinPos: { x: number; y: number }): { x: number; y: number } {
		// 在引脚外侧 50mil 处放置标签
		return {
			x: pinPos.x + 50,
			y: pinPos.y,
		};
	}
}

// 导出单例
export const wireReconnector = new WireReconnector();