# Systematic Review Writing Skill

系统性综述写作专用工作流，整合 AI-Scientist-v2 的迭代改进与 PaperTree 的多Agent协作。

## 使用场景

当用户要求写作系统性综述（Systematic Review）时激活此skill，区别于普通研究论文的写作。

## 核心流程

```
coordinator 接收任务
    │
    ▼
frameworker 生成综述框架
    │
    ▼
writer 顺序写作各章节
    │
    ├──→ citation_agent 补充引用
    ├──→ plot_agent 生成图表
    │
    ▼
systematic_reviewer PRISMA检查
    │
    ▼
critic 审核质量
    │
    ▼
循环直到通过
```

## 系统性综述专用章节结构

### 1. 引言 (Introduction)

```markdown
## 1. 引言

### 1.1 背景与意义
- 疾病背景
- 当前治疗挑战
- 研究必要性

### 1.2 Ferroptosis 定义
- 铁死亡的概念
- 与其他细胞死亡的区别

### 1.3 心肌I/R损伤概述
- 病理机制
- 临床挑战

### 1.4 研究目的
- 本综述要回答的问题
- PICO问题框架
```

### 2. 方法 (Methods)

```markdown
## 2. 方法

### 2.1 检索策略
- 检索数据库列表
- 检索式构建
- 时间范围

### 2.2 纳入与排除标准
- PICO界定
- 研究类型
- 语言限制

### 2.3 文献筛选流程
- 筛选阶段描述
- 去重方法
- PRISMA流程图引用

### 2.4 质量评估
- 评估工具（AMSTAR 2 / Cochrane RoB）
- 评估人员

### 2.5 数据提取
- 提取变量
- 提取方法
- 缺失数据处理
```

### 3. 结果 (Results)

```markdown
## 3. 结果

### 3.1 文献筛选
- PRISMA流程图
- 各阶段文献数量

### 3.2 纳入研究特征
- 研究设计分布
- 样本量分布
- 地理分布

### 3.3 主要发现

#### 3.3.1 机制研究发现
- Nrf2/GPX4/SLC7A11轴
- 铁代谢
- 脂质过氧化

#### 3.3.2 治疗靶点发现
- 靶点分类
- 证据强度

### 3.4 质量评估结果
- 偏倚风险分布
- 证据质量
```

### 4. 讨论 (Discussion)

```markdown
## 4. 讨论

### 4.1 主要发现总结
- 机制理解
- 治疗潜力

### 4.2 与其他综述比较
- 一致性
- 差异性解释

### 4.3 临床意义
- 转化潜力
- 治疗策略

### 4.4 局限性
- 综述局限性
- 证据局限性

### 4.5 未来研究方向
- 基础研究需求
- 临床研究设计
```

### 5. 结论 (Conclusion)

```markdown
## 5. 结论

### 5.1 主要结论
- 机制总结
- 治疗建议

### 5.2 对临床实践的影响
### 5.3 对未来研究的建议
```
## PICO问题框架模板

```json
{
  "PICO": {
    "Population": "心肌缺血再灌注损伤患者/动物模型",
    "Intervention": "靶向铁死亡的干预措施（如Nrf2激活剂、GPX4过表达）",
    "Comparison": "常规治疗/假手术/溶剂对照",
    "Outcome": "心肌梗死面积、心功能、细胞死亡标记物",
    "Study_Type": "随机对照试验、队列研究、病例对照"
  },
  "research_questions": [
    "铁死亡在心肌I/R损伤中的具体机制是什么？",
    "Nrf2/GPX4/SLC7A11轴如何调节心肌铁死亡？",
    "靶向铁死亡的干预措施是否具有心脏保护作用？"
  ]
}
```

## PRISMA合规检查点

### 标题要求
- [ ] 明确标识为"Systematic Review"
- [ ] 包含研究类型关键词

### 摘要要求
- [ ] 背景/目的
- [ ] 方法（检索、筛选、合成方法）
- [ ] 结果（主要发现）
- [ ] 结论

### 方法要求
- [ ] 明确数据库列表
- [ ] 完整检索式（可复现）
- [ ] 明确的纳入排除标准
- [ ] 质量评估工具说明
- [ ] 合成方法说明

### 结果要求
- [ ] PRISMA流程图
- [ ] 纳入研究特征表
- [ ] 偏倚风险评估结果
- [ ] 亚组分析结果（如有）

### 讨论要求
- [ ] 证据强度总结
- [ ] 局限性讨论
- [ ] 未来研究方向

## 工具调用模板

### citation_agent 调用

```json
{
  "action": "find_citation",
  "claim": "Nrf2 activation suppresses ferroptosis in myocardial I/R injury",
  "context": "在动物实验中...",
  "required_study_type": "in_vivo",
  "preferred_journals": ["Cell", "Nature", " Circulation"]
}
```

### plot_agent 调用

```json
{
  "action": "generate_figure",
  "figure_type": "prisma_flowchart",
  "title": "PRISMA Flow Diagram",
  "data": {
    "identified": 235,
    "duplicates_removed": 23,
    "screening": {...},
    "included": 159
  }
}
```

## 质量标准

| 维度 | 标准 | 检查方法 |
|------|------|----------|
| PRISMA合规 | ≥90% | systematic_reviewer检查 |
| 引用完整性 | 每主张有据 | citation_agent核查 |
| 逻辑连贯性 | 章节逻辑清晰 | 同行评审 |
| 数据一致性 | 流程图与正文一致 | 交叉验证 |

## 迭代改进机制

```
writer 完成初稿
    │
    ├─→ systematic_reviewer PRISMA检查
    │       │
    │      发现问题 → writer 修改
    │       │
    ├─→ critic 质量审核
    │       │
    │      Q < 75? → writer 修改
    │       │
    └─→ 通过 → 进入下一章节
```

## 输出规范

### 章节输出

```json
{
  "chapter": "ch2_methods",
  "content": "markdown格式",
  "citations_used": ["Author2024", ...],
  "figures": [{"id": "fig1", "type": "flowchart", "path": "..."}],
  "prisma_checklist_filled": true,
  "self_assessment": {
    "prisma_compliance": "92%",
    "completeness": "95%"
  }
}
```

### 最终输出

```json
{
  "manuscript": "完整综述markdown",
  "prisma_checklist": "已填写的PRISMA checklist",
  "prisma_flowchart": "流程图文件",
  "literature_matrix": "文献整理矩阵",
  "citations": "参考文献列表"
}
```
