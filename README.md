[简体中文](#)

# LoveFinderSeries *NO.733-Phoenix*

智能元件替换助手，让元件替换如凤凰涅槃般完美重生

> 请在配置中勾选："显示在顶部菜单"

> 本项目仓库：[LoveFinder733-Phoenix](https://github.com/48832668/LoveFinder733-Phoenix)

## 简介

原版的元件替换功能存在以下问题：

1. **对比不详细** - 无法看到引脚映射、封装差异等信息
2. **导线断开** - 替换后因符号尺寸不同，导线无法正确连接
3. **网络标签丢失** - 替换后网络标签位置错乱

Phoenix 智能元件替换助手完美解决这些问题：

- ✅ **引脚智能映射** - 自动匹配引脚编号、名称，支持手动调整
- ✅ **导线自动重连** - 智能计算新引脚位置，自动调整导线端点
- ✅ **网络标签附着** - 网络标签跟随引脚移动
- ✅ **详细对比面板** - 清晰展示替换前后的差异

## 功能特性

### 🔥 引脚智能映射

| 匹配策略 | 说明 |
|---------|------|
| 精确匹配 | 引脚编号完全相同（PIN1 → PIN1） |
| 名称匹配 | 引脚名称相同（VCC → VCC） |
| 功能匹配 | 功能相似的引脚（SDA ↔ I2C_DATA） |
| 手动映射 | 用户手动指定映射关系 |

### 🔥 导线自动重连

- 自动计算新引脚位置
- 智能调整导线端点
- 支持L形导线生成
- 处理旋转角度变化

### 🔥 元件身份验证

通过 `deviceUuid` 唯一确定元件型号，确保替换的是目标芯片：

```typescript
// 获取元件的唯一标识
const componentInfo = await component.getState_Component();
// 返回: { libraryUuid: "xxx", uuid: "yyy" }
// uuid 即为该芯片型号在库中的唯一标识
```

## 上手

### 步骤1：选择原元件

在原理图中选中要替换的元件，然后打开插件面板。

![step1](images/step1.png)

### 步骤2：搜索新元件

输入元件名称或型号搜索目标元件。

![step2](images/step2.png)

### 步骤3：确认替换

查看引脚映射和差异信息，确认后执行替换。

![step3](images/step3.png)

## 技术架构

```
src/
├── index.ts                    # 主入口
└── core/
    ├── types.ts                # 类型定义
    ├── component-analyzer.ts   # 元件分析器
    ├── pin-mapper.ts           # 引脚映射器
    ├── wire-reconnector.ts     # 导线重连器
    └── component-replacer.ts   # 元件替换器

iframe/
└── index.html                  # Bootstrap 5 前端界面
```

## API 参考

### 获取选中元件信息

```typescript
const info = await getSelectedComponentInfo();
// 返回: { component, pins, connections }
```

### 搜索元件

```typescript
const results = await searchComponents('STM32F103');
// 返回: [{ uuid, libraryUuid, name, manufacturer }]
```

### 执行替换

```typescript
const result = await executeReplace(oldComponent, newDeviceInfo);
// 返回: { success, message, reconnectedWires, failedWires, details }
```

## 开源许可

本开发工具组使用 [Apache License 2.0](https://choosealicense.com/licenses/apache-2.0/) 开源许可协议