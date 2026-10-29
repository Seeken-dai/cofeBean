# 待办（下一版本）

记录已知但未在当前版本处理的问题，按版本追加。处理后移入 CHANGELOG 并从这里删除。

## 3.0.14 遗留

- **滚轮字段无法清空**：水温、粉量、总水量等滚轮字段只能选数字，界面上没有「清空」入口，已有值无法清成空（非 3.0.14 引入）。后续作为所有滚轮字段的统一能力处理，交互和样式待视觉给出设计。3.0.14 已有的「用户主动清空才写空」代码逻辑保持不变，届时直接接上即可。

## 下一轮结构整理

- **外饮入口死代码（保留，不删）**：`app.js` 里 `#choiceList` 的 `[data-drink-choice]` 分支（`external` → `openExternalDrinkDialog()`，否则 `openBeanPickerForDrink()`）和 `#drinkEmpty` 的 `data-drink-empty-action="external"` 分支，目前没有任何代码或 HTML 生成对应的按钮（`index.html` 空状态只有 `data-drink-empty-action="bean"`）。外饮弹窗现在只能从桌面小组件或编辑已有外饮记录进入。结构整理时决定：恢复一个可见的外饮入口，或连同分支一起删除；在此之前不要删。（3.0.15 发现）
