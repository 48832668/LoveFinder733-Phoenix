/**
 * Phoenix - 智能元件替换
 * 数据加载模块
 */

/**
 * 尝试调用对象的方法
 */
function readMethod<T>(target: unknown, methodName: string): T | undefined {
	if (!target || typeof target !== 'object')
		return undefined;
	const method = (target as Record<string, unknown>)[methodName];
	if (typeof method !== 'function')
		return undefined;
	try {
		return (method as () => T).call(target);
	}
	catch {
		return undefined;
	}
}

/**
 * 尝试读取对象的字段
 */
function readField<T>(target: unknown, fieldNames: string[]): T | undefined {
	if (!target || typeof target !== 'object')
		return undefined;
	for (const fieldName of fieldNames) {
		if (fieldName in (target as Record<string, unknown>)) {
			return (target as Record<string, T | undefined>)[fieldName];
		}
	}
	return undefined;
}

/**
 * 读取状态属性（优先方法，其次字段）
 */
function readState<T>(target: unknown, methodName: string, fieldNames: string[]): T | undefined {
	return readMethod<T>(target, methodName) ?? readField<T>(target, fieldNames);
}

/**
 * 元件信息接口
 */
export interface ComponentInfo {
	primitiveId: string;
	designator: string;
	name: string;
	footprint: string;
	libraryUuid: string;
	componentUuid: string;
	manufacturer?: string;
	pinCount: number;
}

/**
 * 数据加载器类
 */
export class DataLoader {
	/**
	 * 检查当前文档是否为原理图
	 */
	public static async checkSchematicDocument(): Promise<boolean> {
		try {
			const currentDoc = await eda.dmt_SelectControl.getCurrentDocumentInfo();
			return currentDoc?.documentType === 1;
		}
		catch {
			return false;
		}
	}

	/**
	 * 获取当前图页信息
	 */
	public static async getCurrentPageInfo(): Promise<{ uuid: string; name: string } | null> {
		try {
			const page = await eda.dmt_Schematic.getCurrentSchematicPageInfo();
			if (page?.uuid && page?.name) {
				return { uuid: page.uuid, name: page.name };
			}
		}
		catch {
			// 忽略错误
		}
		return null;
	}

	/**
	 * 获取所有图页信息
	 */
	public static async getAllPageInfos(): Promise<Array<{ uuid: string; name: string }>> {
		try {
			const pages = await eda.dmt_Schematic.getCurrentSchematicAllSchematicPagesInfo();
			return (pages || []).map((p, index) => ({
				uuid: p.uuid,
				name: p.name,
				index,
			}));
		}
		catch {
			return [];
		}
	}

	/**
	 * 解析元件信息
	 */
	private static parseComponent(comp: unknown, pageUuid: string): ComponentInfo | null {
		try {
			const primitiveId = readState<string>(comp, 'getState_PrimitiveId', ['primitiveId']) || '';
			if (!primitiveId) return null;

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

			return {
				primitiveId,
				designator,
				name,
				footprint: footprintInfo?.uuid || '-',
				libraryUuid: componentInfo?.libraryUuid || '',
				componentUuid: componentInfo?.uuid || '',
				manufacturer: manufacturer || undefined,
				pinCount: 0, // 稍后填充
			};
		}
		catch (e) {
			console.warn('[DataLoader] 解析元件失败:', e);
			return null;
		}
	}

	/**
	 * 获取所有元件
	 */
	public static async getAllComponents(): Promise<{
		success: boolean;
		components: ComponentInfo[];
		message?: string;
	}> {
		try {
			const isSchematic = await this.checkSchematicDocument();
			if (!isSchematic) {
				return {
					success: false,
					components: [],
					message: '当前文档不是原理图，请打开原理图后再试',
				};
			}

			// 获取所有图页
			const pages = await this.getAllPageInfos();
			if (pages.length === 0) {
				return {
					success: false,
					components: [],
					message: '未找到图页，请确保已打开原理图',
				};
			}

			// 获取当前图页 UUID（用于恢复）
			const currentPage = await this.getCurrentPageInfo();
			const originalPageUuid = currentPage?.uuid;

			const allComponents: ComponentInfo[] = [];

			// 遍历所有图页
			for (const page of pages) {
				try {
					// 切换到该图页
					await eda.dmt_EditorControl.openDocument(page.uuid);
					await new Promise(r => setTimeout(r, 100));

					// 获取该图页的所有元件对象
					const comps = await eda.sch_PrimitiveComponent.getAll();

					for (const comp of comps || []) {
						const info = this.parseComponent(comp, page.uuid);
						if (info) {
							// 获取引脚数量
							try {
								const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(info.primitiveId);
								info.pinCount = pins?.length || 0;
							}
							catch {
								// 忽略引脚获取错误
							}

							allComponents.push(info);
						}
					}
				}
				catch (e) {
					console.warn(`[DataLoader] 加载图页 ${page.name} 失败:`, e);
				}
			}

			// 恢复到原来的图页
			if (originalPageUuid) {
				try {
					await eda.dmt_EditorControl.openDocument(originalPageUuid);
				}
				catch {
					// 忽略恢复错误
				}
			}

			return {
				success: true,
				components: allComponents,
			};
		}
		catch (error) {
			return {
				success: false,
				components: [],
				message: `获取元件列表失败: ${error}`,
			};
		}
	}

	/**
	 * 获取当前图页的元件
	 */
	public static async getCurrentPageComponents(): Promise<{
		success: boolean;
		components: ComponentInfo[];
		message?: string;
	}> {
		try {
			const isSchematic = await this.checkSchematicDocument();
			if (!isSchematic) {
				return {
					success: false,
					components: [],
					message: '当前文档不是原理图',
				};
			}

			const currentPage = await this.getCurrentPageInfo();
			if (!currentPage) {
				return {
					success: false,
					components: [],
					message: '无法获取当前图页信息',
				};
			}

			// 获取当前图页的所有元件
			const comps = await eda.sch_PrimitiveComponent.getAll();
			const components: ComponentInfo[] = [];

			for (const comp of comps || []) {
				const info = this.parseComponent(comp, currentPage.uuid);
				if (info) {
					// 获取引脚数量
					try {
						const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(info.primitiveId);
						info.pinCount = pins?.length || 0;
					}
					catch {
						// 忽略引脚获取错误
					}

					components.push(info);
				}
			}

			return {
				success: true,
				components,
			};
		}
		catch (error) {
			return {
				success: false,
				components: [],
				message: `获取元件列表失败: ${error}`,
			};
		}
	}
}

export const dataLoader = DataLoader;