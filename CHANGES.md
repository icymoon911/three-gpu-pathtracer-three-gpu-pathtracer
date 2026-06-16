# 代码变更清单

## 文件: src/core/WebGLPathTracer.js

### 新增方法

#### 1. updateScene(options)
主入口方法，支持显式指定变更或自动检测。

**位置**: 第 200-280 行

**功能**:
- 接受 options 参数显式指定要更新的组件
- 无参数时自动调用 `_detectChanges()` 检测变更
- 根据变更类型调用相应的 update 方法
- 对 DOF-only 变更优化，跳过 reset

#### 2. _applyExplicitChanges(options)
处理显式指定的变更，统一 reset。

**位置**: 第 282-330 行

**功能**:
- 按顺序应用 environment、lights、materials、camera 更新
- 使用 `needsReset` 标志跟踪
- 只在最后调用一次 `reset()`

#### 3. _detectChanges()
自动检测场景变更，返回最昂贵的变更类型。

**位置**: 第 470-570 行

**功能**:
- 按成本顺序检查：materials > environment > lights > camera
- 检测 PhysicalCamera DOF 参数变化
- 检测灯光形状信息变化（isCircular, radius）
- 检测 ProceduralEquirectTexture 内容变化（通过版本号）
- 返回最昂贵的变更类型

#### 4. _getLightHash(light)
生成包含形状信息的灯光 hash。

**位置**: 第 600-620 行

**功能**:
- 基础 hash: uuid + intensity + color
- ShapedAreaLight: 添加 isCircular
- PhysicalSpotLight: 添加 radius

#### 5. _updateChangeDetectionCache(camera, scene)
更新变更检测的缓存状态。

**位置**: 第 622-670 行

**功能**:
- 缓存相机矩阵和投影矩阵
- 缓存 DOF 参数
- 缓存所有灯光的 hash
- 缓存环境贴图引用和版本号

### 修改的方法

#### updateCamera(cameraOnly = false)
**位置**: 第 209-222 行

**变更**:
- 添加 `cameraOnly` 参数（默认 false）
- 当 `cameraOnly` 为 true 时跳过 `reset()`
- 用于 DOF-only 变更优化

```javascript
updateCamera( cameraOnly = false ) {
    const camera = this.camera;
    camera.updateMatrixWorld();
    
    this._pathTracer.setCamera( camera );
    this._lowResPathTracer.setCamera( camera );
    
    // If cameraOnly is true, skip the reset (useful for DOF-only changes)
    if ( ! cameraOnly ) {
        this.reset();
    }
}
```

### 新增成员变量

**位置**: constructor (第 103-159 行)

- `_cameraDOFOnlyChange`: 标记是否为纯 DOF 变更
- `_previousCameraMatrix`: 上一帧相机矩阵
- `_previousCameraProjection`: 上一帧投影矩阵
- `_previousCameraDOF`: 上一帧 DOF 参数
- `_previousLightHashes`: 上一帧灯光 hash Map
- `_previousEnvironmentVersion`: 上一帧环境贴图版本号

## 文件: src/textures/ProceduralEquirectTexture.js

### 新增属性

#### _updateVersion
**位置**: constructor (第 29 行)

```javascript
this._updateVersion = 0;
```

### 修改的方法

#### update()
**位置**: 第 32-66 行

**变更**:
- 在开头添加 `this._updateVersion ++;`
- 每次更新时递增版本号

```javascript
update() {
    this.dispose();
    this.needsUpdate = true;
    this._updateVersion ++;  // 新增
    // ... rest of the method
}
```

#### copy(other)
**位置**: 第 68-74 行

**变更**:
- 复制 `_updateVersion` 属性

```javascript
copy( other ) {
    super.copy( other );
    this.generationCallback = other.generationCallback;
    this._updateVersion = other._updateVersion || 0;  // 新增
    return this;
}
```

## 文件: src/index.d.ts

### 类型定义更新

#### updateCamera 签名
**位置**: 第 153 行

```typescript
updateCamera( cameraOnly?: boolean ): void;
```

#### updateScene 签名
**位置**: 第 154-162 行

```typescript
updateScene( options?: {
    camera?: boolean;
    lights?: boolean;
    materials?: boolean;
    environment?: boolean;
    geometry?: boolean;
} ): 'none' | 'camera' | 'lights' | 'materials' | 'environment' | 'geometry' | 'all';
```

## 变更统计

- **新增方法**: 5 个
- **修改方法**: 3 个
- **新增成员变量**: 6 个
- **新增类型定义**: 2 个
- **代码行数**: 约 400 行新增/修改

## 兼容性

- 所有新方法都是增量添加，不破坏现有 API
- `updateCamera()` 参数有默认值，向后兼容
- 类型定义使用可选参数，不影响现有代码

## 测试状态

- ✓ ESLint 检查通过（0 errors, 4 warnings - 均为无关文件）
- ✓ TypeScript 类型检查通过
- ✓ 结构验证全部通过（20/20 检查点）
