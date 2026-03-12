/**
 * Phoenix - 智能元件替换
 * 引脚映射器
 * 负责建立新旧元件之间的引脚映射关系
 */

import type { PinMapping, PinState, WireConnection } from './types';

/**
 * 引脚映射器类
 */
export class PinMapper {
	/**
	 * 建立引脚映射
	 * @param oldPins 原元件引脚列表
	 * @param newPins 新元件引脚列表
	 * @param wireConnections 原元件的网络连接信息
	 */
	buildPinMappings(
		oldPins: PinState[],
		newPins: PinState[],
		wireConnections: WireConnection[]
	): PinMapping[] {
		const mappings: PinMapping[] = [];
		const usedNewPins = new Set<string>();

		// 第一轮：引脚编号精确匹配
		for (const oldPin of oldPins) {
			const exactMatch = newPins.find(
				np => np.pinNumber === oldPin.pinNumber && !usedNewPins.has(np.pinNumber)
			);

			if (exactMatch) {
				const connection = wireConnections.find(c => c.pinNumber === oldPin.pinNumber);
				mappings.push(this.createMapping(oldPin, exactMatch, connection, 'exact'));
				usedNewPins.add(exactMatch.pinNumber);
			}
		}

		// 第二轮：引脚名称匹配
		for (const oldPin of oldPins) {
			// 跳过已映射的引脚
			if (mappings.some(m => m.oldPinNumber === oldPin.pinNumber)) {
				continue;
			}

			const nameMatch = newPins.find(
				np => this.normalizePinName(np.pinName) === this.normalizePinName(oldPin.pinName)
					&& !usedNewPins.has(np.pinNumber)
			);

			if (nameMatch) {
				const connection = wireConnections.find(c => c.pinNumber === oldPin.pinNumber);
				mappings.push(this.createMapping(oldPin, nameMatch, connection, 'name'));
				usedNewPins.add(nameMatch.pinNumber);
			}
		}

		// 第三轮：功能相似匹配（常见引脚名称）
		for (const oldPin of oldPins) {
			if (mappings.some(m => m.oldPinNumber === oldPin.pinNumber)) {
				continue;
			}

			const functionalMatch = this.findFunctionalMatch(oldPin, newPins, usedNewPins);
			if (functionalMatch) {
				const connection = wireConnections.find(c => c.pinNumber === oldPin.pinNumber);
				mappings.push(this.createMapping(oldPin, functionalMatch, connection, 'name'));
				usedNewPins.add(functionalMatch.pinNumber);
			}
		}

		return mappings;
	}

	/**
	 * 创建映射对象
	 */
	private createMapping(
		oldPin: PinState,
		newPin: PinState,
		connection: WireConnection | undefined,
		matchType: 'exact' | 'name' | 'manual'
	): PinMapping {
		return {
			oldPinNumber: oldPin.pinNumber,
			oldPinName: oldPin.pinName,
			newPinNumber: newPin.pinNumber,
			newPinName: newPin.pinName,
			netName: connection?.netName ?? oldPin.net ?? '',
			matchType,
			oldPosition: { x: oldPin.x, y: oldPin.y },
			newPosition: { x: newPin.x, y: newPin.y },
			wireIds: connection?.wireIds ?? [],
		};
	}

	/**
	 * 标准化引脚名称（用于比较）
	 */
	private normalizePinName(name: string): string {
		return name
			.toUpperCase()
			.replace(/[_\-\s]/g, '')
			.replace(/VCC|VDD/g, 'V')
			.replace(/GND|VSS/g, 'G');
	}

	/**
	 * 功能相似匹配
	 */
	private findFunctionalMatch(
		oldPin: PinState,
		newPins: PinState[],
		usedNewPins: Set<string>
	): PinState | null {
		// 常见功能引脚组
		const functionalGroups: string[][] = [
			['VCC', 'VDD', 'V+', 'VIN', 'POWER'],
			['GND', 'VSS', 'GROUND', 'EARTH'],
			['SDA', 'I2C_SDA', 'DATA'],
			['SCL', 'I2C_SCL', 'CLK', 'CLOCK'],
			['TX', 'TXD', 'UART_TX', 'TRANSMIT'],
			['RX', 'RXD', 'UART_RX', 'RECEIVE'],
			['MOSI', 'SPI_MOSI', 'SDO', 'DOUT'],
			['MISO', 'SPI_MISO', 'SDI', 'DIN'],
			['SCK', 'SCLK', 'SPI_CLK', 'CLK'],
			['CS', 'CSN', 'SS', 'CHIP_SELECT'],
		];

		const oldName = this.normalizePinName(oldPin.pinName);

		for (const group of functionalGroups) {
			const normalizedGroup = group.map(g => this.normalizePinName(g));

			if (normalizedGroup.includes(oldName)) {
				// 找到匹配组，在新引脚中查找
				for (const newPin of newPins) {
					if (usedNewPins.has(newPin.pinNumber)) {
						continue;
					}

					const newName = this.normalizePinName(newPin.pinName);
					if (normalizedGroup.includes(newName)) {
						return newPin;
					}
				}
			}
		}

		return null;
	}

	/**
	 * 获取未匹配的引脚
	 */
	getUnmatchedPins(
		oldPins: PinState[],
		newPins: PinState[],
		mappings: PinMapping[]
	): { oldPins: string[]; newPins: string[] } {
		const mappedOld = new Set(mappings.map(m => m.oldPinNumber));
		const mappedNew = new Set(mappings.map(m => m.newPinNumber));

		return {
			oldPins: oldPins.filter(p => !mappedOld.has(p.pinNumber)).map(p => `${p.pinNumber}(${p.pinName})`),
			newPins: newPins.filter(p => !mappedNew.has(p.pinNumber)).map(p => `${p.pinNumber}(${p.pinName})`),
		};
	}

	/**
	 * 验证映射完整性
	 */
	validateMappings(mappings: PinMapping[]): {
		isComplete: boolean;
		missingNets: string[];
		warnings: string[];
	} {
		const warnings: string[] = [];
		const missingNets: string[] = [];

		for (const mapping of mappings) {
			// 检查是否有网络名称但匹配类型为手动
			if (mapping.netName && mapping.matchType === 'manual') {
				warnings.push(`引脚 ${mapping.oldPinNumber} 需要手动确认映射`);
			}

			// 检查是否有网络但无导线连接
			if (mapping.netName && mapping.wireIds.length === 0) {
				missingNets.push(mapping.netName);
			}
		}

		return {
			isComplete: warnings.length === 0,
			missingNets: [...new Set(missingNets)],
			warnings,
		};
	}

	/**
	 * 手动调整映射
	 */
	adjustMapping(
		mappings: PinMapping[],
		oldPinNumber: string,
		newPinNumber: string
	): PinMapping[] {
		return mappings.map(m => {
			if (m.oldPinNumber === oldPinNumber) {
				return {
					...m,
					newPinNumber,
					matchType: 'manual' as const,
				};
			}
			return m;
		});
	}
}

// 导出单例
export const pinMapper = new PinMapper();