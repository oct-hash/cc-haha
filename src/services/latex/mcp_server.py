#!/usr/bin/env python3
"""
ChineseResearchLaTeX MCP 服务器

提供 LaTeX 项目管理接口，供 Claude Code 通过 MCP 调用。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

# MCP SDK
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# 项目路径 - 使用绝对路径
REPO_DIR = Path("D:/claude-code-official/ChineseResearchLaTeX-temp")
PACKAGES_DIR = REPO_DIR / "packages"
PROJECTS_DIR = REPO_DIR / "projects"
TEXMF_DIR = Path("D:/texmf")

# 创建服务器
server = Server("chinese-research-latex")


def get_tools() -> list[Tool]:
    """返回所有可用工具"""
    return [
        Tool(
            name="list_templates",
            description="列出所有可用的 LaTeX 模板",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="list_projects",
            description="列出所有已创建的项目",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="build_project",
            description="编译 LaTeX 项目生成 PDF",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_type": {
                        "type": "string",
                        "enum": ["nsfc", "paper", "thesis", "cv"],
                        "description": "项目类型",
                    },
                    "project_name": {
                        "type": "string",
                        "description": "项目名称，如 NSFC_Young、paper-sci-01",
                    },
                    "tex_file": {
                        "type": "string",
                        "default": "main.tex",
                        "description": "主 TeX 文件名",
                    },
                },
                "required": ["project_type"],
            },
        ),
        Tool(
            name="clean_project",
            description="清理项目编译缓存和中间文件",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_type": {
                        "type": "string",
                        "enum": ["nsfc", "paper", "thesis", "cv"],
                        "description": "项目类型",
                    },
                    "project_name": {
                        "type": "string",
                        "description": "项目名称",
                    },
                },
                "required": ["project_type"],
            },
        ),
        Tool(
            name="create_project",
            description="创建新的 LaTeX 项目",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_type": {
                        "type": "string",
                        "enum": ["nsfc", "paper", "thesis", "cv"],
                        "description": "项目类型",
                    },
                    "profile": {
                        "type": "string",
                        "enum": ["young", "general", "local", "sci", "master", "doctor"],
                        "description": "项目配置",
                    },
                    "project_name": {
                        "type": "string",
                        "description": "新项目名称",
                    },
                    "target_dir": {
                        "type": "string",
                        "description": "目标目录路径",
                    },
                },
                "required": ["project_type", "project_name"],
            },
        ),
        Tool(
            name="validate_template",
            description="验证 LaTeX 模板语法",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_type": {
                        "type": "string",
                        "enum": ["nsfc", "paper", "thesis", "cv"],
                        "description": "项目类型",
                    },
                    "project_name": {
                        "type": "string",
                        "description": "项目名称",
                    },
                },
                "required": ["project_type"],
            },
        ),
    ]


@server.list_tools()
async def list_tools() -> list[Tool]:
    """列出所有可用工具"""
    return get_tools()


def run_build_command(cmd: list[str], cwd: Path | None = None) -> dict[str, Any]:
    """执行构建命令并返回结果"""
    env = os.environ.copy()
    if TEXMF_DIR.exists():
        texmfhome = str(TEXMF_DIR)
        if "TEXMFHOME" not in env:
            env["TEXMFHOME"] = texmfhome
        # 添加到 TEXINPUTS
        existing = env.get("TEXINPUTS", "")
        env["TEXINPUTS"] = f"{texmfhome}/tex/latex//:{existing}"

    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            env=env,
            text=True,
            capture_output=True,
            timeout=300,
        )
        return {
            "success": result.returncode == 0,
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "编译超时（5分钟）"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """调用工具"""
    result: dict[str, Any] = {}

    if name == "list_templates":
        templates = {
            "nsfc": {
                "profiles": ["young", "general", "local"],
                "description": "国家自然科学基金标书模板",
            },
            "paper": {
                "profiles": ["sci"],
                "description": "SCI 论文模板",
            },
            "thesis": {
                "profiles": ["master", "doctor", "bachelor", "postdoc"],
                "description": "学位论文模板",
            },
            "cv": {
                "profiles": ["standard"],
                "description": "学术简历模板",
            },
        }
        result = {"templates": templates}

    elif name == "list_projects":
        projects: dict[str, list[str]] = {}
        for proj_dir in PROJECTS_DIR.iterdir():
            if proj_dir.is_dir():
                proj_type = "unknown"
                if "NSFC" in proj_dir.name:
                    proj_type = "nsfc"
                elif "paper" in proj_dir.name:
                    proj_type = "paper"
                elif "thesis" in proj_dir.name:
                    proj_type = "thesis"
                elif "cv" in proj_dir.name:
                    proj_type = "cv"

                if proj_type not in projects:
                    projects[proj_type] = []
                projects[proj_type].append(proj_dir.name)

        result = {"projects": projects}

    elif name == "build_project":
        project_type = arguments.get("project_type")
        project_name = arguments.get("project_name")
        tex_file = arguments.get("tex_file", "main.tex")

        if not project_name:
            return [TextContent(type="text", text="错误：需要指定 project_name")]

        project_dir = PROJECTS_DIR / project_name
        if not project_dir.exists():
            return [TextContent(type="text", text=f"项目不存在：{project_name}")]

        # 根据项目类型选择构建脚本
        if project_type == "nsfc":
            script = PACKAGES_DIR / "bensz-nsfc" / "scripts" / "nsfc_project_tool.py"
            cmd = [sys.executable, str(script), "build", "--project-dir", str(project_dir)]
        elif project_type == "paper":
            script = PACKAGES_DIR / "bensz-paper" / "scripts" / "paper_project_tool.py"
            cmd = [sys.executable, str(script), "build", "--project-dir", str(project_dir)]
        elif project_type == "thesis":
            script = PACKAGES_DIR / "bensz-thesis" / "scripts" / "thesis_project_tool.py"
            cmd = [sys.executable, str(script), "build", "--project-dir", str(project_dir)]
        elif project_type == "cv":
            script = PACKAGES_DIR / "bensz-cv" / "scripts" / "cv_project_tool.py"
            cmd = [sys.executable, str(script), "build", "--project-dir", str(project_dir)]
        else:
            return [TextContent(type="text", text=f"未知项目类型：{project_type}")]

        build_result = run_build_command(cmd, cwd=project_dir)

        if build_result.get("success"):
            result = {
                "status": "success",
                "message": f"项目 {project_name} 编译成功",
                "pdf": str(project_dir / "main.pdf"),
            }
        else:
            result = {
                "status": "error",
                "message": f"项目 {project_name} 编译失败",
                "error": build_result.get("stderr", build_result.get("error", "未知错误")),
            }

    elif name == "clean_project":
        project_type = arguments.get("project_type")
        project_name = arguments.get("project_name")

        if not project_name:
            return [TextContent(type="text", text="错误：需要指定 project_name")]

        project_dir = PROJECTS_DIR / project_name
        if not project_dir.exists():
            return [TextContent(type="text", text=f"项目不存在：{project_name}")]

        # 根据项目类型选择清理脚本
        if project_type == "nsfc":
            script = PACKAGES_DIR / "bensz-nsfc" / "scripts" / "nsfc_project_tool.py"
            cmd = [sys.executable, str(script), "clean", "--project-dir", str(project_dir)]
        elif project_type in ("paper", "thesis", "cv"):
            script = PACKAGES_DIR / f"bensz-{project_type}" / "scripts" / f"{project_type}_project_tool.py"
            cmd = [sys.executable, str(script), "clean", "--project-dir", str(project_dir)]
        else:
            return [TextContent(type="text", text=f"未知项目类型：{project_type}")]

        clean_result = run_build_command(cmd, cwd=project_dir)
        result = {
            "status": "success" if clean_result.get("success") else "error",
            "message": f"项目 {project_name} 清理完成",
        }

    elif name == "create_project":
        project_type = arguments.get("project_type")
        project_name = arguments.get("project_name")
        profile = arguments.get("profile")
        target_dir = arguments.get("target_dir")

        if not project_name:
            return [TextContent(type="text", text="错误：需要指定 project_name")]

        # 确定目标目录
        if target_dir:
            dest_dir = Path(target_dir) / project_name
        else:
            dest_dir = PROJECTS_DIR / project_name

        # 根据项目类型和 profile 选择模板
        if project_type == "nsfc":
            profile = profile or "young"
            template_dir = PROJECTS_DIR / f"NSFC_{profile.capitalize()}"
            if not template_dir.exists():
                return [TextContent(type="text", text=f"模板不存在：NSFC_{profile}")]

        elif project_type == "paper":
            template_dir = PROJECTS_DIR / "paper-sci-01"

        elif project_type == "thesis":
            profile = profile or "master"
            # 找到对应的模板
            for t in PROJECTS_DIR.iterdir():
                if t.is_dir() and f"thesis-{profile}" in t.name:
                    template_dir = t
                    break
            else:
                return [TextContent(type="text", text=f"未找到 {profile} 类型论文模板")]

        elif project_type == "cv":
            template_dir = PROJECTS_DIR / "cv-01"

        else:
            return [TextContent(type="text", text=f"未知项目类型：{project_type}")]

        if not template_dir.exists():
            return [TextContent(type="text", text=f"模板目录不存在：{template_dir}")]

        # 复制模板（浅拷贝，只复制关键文件）
        try:
            dest_dir.mkdir(parents=True, exist_ok=True)

            # 复制关键文件和目录
            for item in ["main.tex", "extraTex", "references", "figures", "scripts"]:
                src = template_dir / item
                dst = dest_dir / item
                if src.exists():
                    if src.is_dir():
                        import shutil
                        shutil.copytree(src, dst, dirs_exist_ok=True)
                    else:
                        import shutil
                        shutil.copy2(src, dst)

            result = {
                "status": "success",
                "message": f"项目 {project_name} 创建成功",
                "path": str(dest_dir),
            }
        except Exception as e:
            result = {"status": "error", "error": str(e)}

    elif name == "validate_template":
        project_type = arguments.get("project_type")
        project_name = arguments.get("project_name")

        if not project_name:
            return [TextContent(type="text", text="错误：需要指定 project_name")]

        project_dir = PROJECTS_DIR / project_name
        if not project_dir.exists():
            return [TextContent(type="text", text=f"项目不存在：{project_name}")]

        tex_file = project_dir / "main.tex"
        if not tex_file.exists():
            return [TextContent(type="text", text=f"主文件不存在：{tex_file}")]

        # 简单语法检查：尝试 XeLaTeX 编译一版
        build_result = run_build_command(
            [sys.executable, "-c", f"import subprocess; subprocess.run(['xelatex', '-interaction=nonstopmode', '{tex_file}'], check=False)"],
            cwd=project_dir,
        )

        result = {
            "status": "success" if build_result.get("success") else "warning",
            "message": "模板语法验证完成",
        }

    else:
        return [TextContent(type="text", text=f"未知工具：{name}")]

    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


async def main():
    """启动 MCP 服务器"""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())