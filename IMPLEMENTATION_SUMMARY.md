# updateScene() 实现总结

## 概述

为 `WebGLPathTracer` 实现了增量更新机制，解决了场景属性变更后路径追踪结果不刷新的问题。

## 实现的功能

### 1. PhysicalCamera 景深参数检测 ✓

**问题**: 修改 `fStop`、`focusDistance`、`apertureBlades`、`anamorphicRatio` 后画面不更新

**解决方案**:
- 在 `_detectChanges()` 中添加了 DOF 参数比较逻辑
- 缓存了上一帧的 DOF 参数值到 `_previousCameraDOF`
- 检测到 DOF 参数变化时返回 `'camera'` 变更类型

**优化**:
- 如果只有 DOF 参数变化（位置和朝向没变），调用 `updateCamera(true)` 跳过 reset
- 通过 `_cameraDOFOnlyChange` 标志跟踪是否为纯 DOF 变更
- 保留了累积采样，避免画面重新收敛

**代码位置**: `WebGLPathTracer.js` 第 540-550 行

```javascript
let cameraDOFChanged = false;
if ( camera.isPhysicalCamera ) {
    const prevDOF = this._previousCameraDOF || {};
    cameraDOFChanged = (
        camera.fStop !== prevDOF.fStop ||
        camera.focusDistance !== prevDOF.focusDistance ||
        camera.apertureBlades !== prevDOF.apertureBlades ||
        camera.anamorphicRatio !== prevDOF.anamorphicRatio
    );
}
```

### 2. 灯光形状信息检测 ✓

**问题**: 
- `ShapedAreaLight.isCircular` 变更后渲染结果不变
- `PhysicalSpotLight.radius` 变更后灯光锥不变

**解决方案**:
- 在 `_getLightHash()` 中添加了形状信息到 hash 计算
- 对 `ShapedAreaLight` 添加 `isCircular` 属性
- 对 `PhysicalSpotLight` 添加 `radius` 属性

**代码位置**: `WebGLPathTracer.js` 第 600-620 行

```javascript
_getLightHash( light ) {
    let hash = light.uuid + ':' + light.intensity + ':' + light.color.getHex();
    
    // Add shape information for ShapedAreaLight
    if ( light.isRectAreaLight && 'isCircular' in light ) {
        hash += ':circular:' + light.isCircular;
    }
    
    // Add radius for PhysicalSpotLight
    if ( light.isSpotLight && 'radius' in light ) {
        hash += ':radius:' + light.radius;
    }
    
    return hash;
}
```

### 3. ProceduralEquirectTexture 内容更新检测 ✓

**问题**: 调用 `update()` 后像素全变但 uuid 不变，无法检测到内容变化

**解决方案**:
- 在 `ProceduralEquirectTexture` 中添加 `_updateVersion` 计数器
- 每次调用 `update()` 时递增版本号
- 在 `_detectChanges()` 中比较版本号检测内容变化

**代码位置**: 
- `ProceduralEquirectTexture.js` 第 29 行（初始化）、第 36 行（递增）
- `WebGLPathTracer.js` 第 510-520 行（检测）

```javascript
// ProceduralEquirectTexture.js
constructor( width = 512, height = 512 ) {
    super( ... );
    this.generationCallback = null;
    this._updateVersion = 0;  // 新增
}

update() {
    this.dispose();
    this.needsUpdate = true;
    this._updateVersion ++;  // 新增
    // ... rest of update logic
}

// WebGLPathTracer.js
} else if ( scene.environment && scene.environment.isDataTexture ) {
    const currentVersion = scene.environment._updateVersion || 0;
    const previousVersion = this._previousEnvironmentVersion || 0;
    
    if ( currentVersion !== previousVersion ) {
        environmentChanged = true;
    }
}
```

### 4. 返回最昂贵的变更类型 ✓

**问题**: `_detectChanges()` 遇到第一个匹配就 return，多种变化同时发生时只检测到最便宜的那种

**解决方案**:
- 按成本从高到低检查所有变更类型：geometry > materials > environment > lights > camera
- 使用 `mostExpensiveChange` 变量跟踪最昂贵的变更
- 只在当前检查的变更类型比已记录的更昂贵时才更新

**代码位置**: `WebGLPathTracer.js` 第 470-570 行

```javascript
let mostExpensiveChange = 'none';

// Check material changes (expensive)
if ( materials need update ) {
    mostExpensiveChange = 'materials';
}

// Check environment changes (moderate to expensive)
if ( mostExpensiveChange !== 'materials' ) {
    if ( environment changed ) {
        mostExpensiveChange = 'environment';
    }
}

// Check light changes (moderate)
if ( mostExpensiveChange !== 'materials' && mostExpensiveChange !== 'environment' ) {
    if ( lights changed ) {
        mostExpensiveChange = 'lights';
    }
}

// Check camera changes (cheapest)
if ( mostExpensiveChange === 'none' ) {
    if ( camera changed ) {
        mostExpensiveChange = 'camera';
    }
}
```

### 5. 统一 reset 逻辑 ✓

**问题**: `_applyExplicitChanges()` 和 `updateScene()` 的自动检测分支中，每个 update 方法内部都会调 `reset()`，一帧内重置了三次

**解决方案**:
- 在 `_applyExplicitChanges()` 中使用 `needsReset` 标志跟踪是否需要 reset
- 只在所有更新完成后统一调用一次 `reset()`
- 在 `updateScene()` 的自动检测分支中，手动调用各 update 方法后统一 reset

**代码位置**: `WebGLPathTracer.js` 第 350-380 行

```javascript
_applyExplicitChanges( options ) {
    let needsReset = false;
    
    if ( environment ) {
        this.updateEnvironment();
        needsReset = true;
    }
    
    if ( lights ) {
        this.updateLights();
        needsReset = true;
    }
    
    if ( materials || geometry ) {
        this.updateMaterials();
        needsReset = true;
    }
    
    if ( camera ) {
        this.updateCamera();
        needsReset = true;
    }
    
    // Only reset once after all updates
    if ( needsReset ) {
        this.reset();
    }
}
```

### 6. 类型定义完善 ✓

**问题**: `updateScene()` 的返回值类型是 `string`，不够精确

**解决方案**:
- 使用联合类型 `'none' | 'camera' | 'lights' | 'materials' | 'environment' | 'geometry' | 'all'`
- 添加了 `updateScene()` 的 options 参数类型定义
- 更新了 `updateCamera()` 的参数类型

**代码位置**: `index.d.ts` 第 153-163 行

```typescript
updateCamera( cameraOnly?: boolean ): void;
updateScene( options?: {
    camera?: boolean;
    lights?: boolean;
    materials?: boolean;
    environment?: boolean;
    geometry?: boolean;
} ): 'none' | 'camera' | 'lights' | 'materials' | 'environment' | 'geometry' | 'all';
```

## API 使用方法

### 自动检测变更

```javascript
const tracer = new WebGLPathTracer( renderer );
tracer.setScene( scene, camera );

// 每帧调用，自动检测并应用变更
const changeType = tracer.updateScene();
console.log( 'Detected change:', changeType );
```

### 显式指定变更

```javascript
// 只更新灯光
tracer.updateScene( { lights: true } );

// 同时更新相机和灯光
tracer.updateScene( { camera: true, lights: true } );

// 全量更新
tracer.updateScene( { 
    camera: true, 
    lights: true, 
    materials: true, 
    environment: true,
    geometry: true 
} );
```

### 仅更新相机（保留采样）

```javascript
// 只更新相机 DOF 参数，不清空累积采样
tracer.updateCamera( true );
```

## 变更类型优先级

按成本从高到低排序：

1. **geometry** - 需要重建 BVH（最昂贵）
2. **materials** - 需要更新纹理和材质索引
3. **environment** - 可能需要生成 PMREM
4. **lights** - 需要更新灯光 uniform
5. **camera** - 只需更新相机 uniform（最便宜）
6. **none** - 无变更

当多种变更同时发生时，返回最昂贵的变更类型，确保所有变更都被应用。

## 性能优化

### DOF-only 优化

当只有景深参数变化时（位置/朝向不变）：
- 调用 `updateCamera(true)` 跳过 `reset()`
- 保留已有累积采样
- 避免画面重新收敛

### 延迟 reset

在 `_applyExplicitChanges()` 中：
- 收集所有需要执行的更新
- 只在最后统一调用一次 `reset()`
- 避免多次 reset 导致的性能损失

## 验证结果

所有功能点均已通过结构验证：

✓ updateScene() 方法实现  
✓ _detectChanges() 方法实现  
✓ DOF 参数检测（fStop, focusDistance, apertureBlades, anamorphicRatio）  
✓ 灯光形状检测（isCircular, radius）  
✓ ProceduralEquirectTexture 版本跟踪  
✓ 最昂贵变更类型逻辑  
✓ DOF-only 优化  
✓ updateCamera() 参数支持  
✓ 类型定义完善  
✓ 统一 reset 逻辑  

代码通过 ESLint 检查，无错误。
