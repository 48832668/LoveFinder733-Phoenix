/**
 * Phoenix - 智能元件替换
 * 类型定义文件
 */

/**
 * 位置坐标
 */
export interface Position {
	x: number;
	y: number;
}

/**
 * 引脚状态信息
 */
export interface PinState {
	pinNumber: string;
	pinName: string;
	x: number;
	y: number;
	rotation: number;
	pinLength: number;
	net?: string;
}

/**
 * 元件状态信息
 */
export interface ComponentState {
	primitiveId: string;
	name?: string;
	designator?: string;
	x: number;
	y: number;
	rotation: number;
	mirror: boolean;
	component: {
		libraryUuid: string;
		uuid: string;
	};
	footprint?: {
		libraryUuid: string;
		uuid: string;
	};
	uniqueId?: string;
}

/**
 * 网络连接信息
 */
export interface WireConnection {
	netName: string;
	pinNumber: string;
	pinName: string;
	position: Position;
	wireIds: string[];
}

/**
 * 引脚映射
 */
export interface PinMapping {
	oldPinNumber: string;
	oldPinName: string;
	newPinNumber: string;
	newPinName: string;
	netName: string;
	matchType: 'exact' | 'name' | 'manual';
	oldPosition: Position;
	newPosition: Position;
	wireIds: string[];
}

/**
 * 元件对比结果
 */
export interface ComponentDiff {
	oldComponent: ComponentState;
	newComponent: {
		libraryUuid: string;
		uuid: string;
		name: string;
	};
	pinCountOld: number;
	pinCountNew: number;
	pinMappings: PinMapping[];
	unmatchedOldPins: string[];
	unmatchedNewPins: string[];
	wireReconnectCount: number;
	manualReconnectCount: number;
}

/**
 * 替换结果
 */
export interface ReplaceResult {
	success: boolean;
	message: string;
	reconnectedWires: number;
	failedWires: number;
	details: string[];
}

/**
 * 元件搜索结果
 */
export interface ComponentSearchResult {
	uuid: string;
	libraryUuid: string;
	name: string;
	manufacturer?: string;
	manufacturerId?: string;
	description?: string;
}

/**
 * 导线状态
 */
export interface WireState {
	primitiveId: string;
	line: number[];
	net?: string;
}

/**
 * 替换选项
 */
export interface ReplaceOptions {
	autoPinMapping: boolean;
	preserveAttributes: boolean;
	wireReconnectMode: 'smart' | 'manual';
	showPreview: boolean;
	highlightUnmatched: boolean;
}