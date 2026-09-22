import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

let provider: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext) {
    provider = vscode.languages.registerCompletionItemProvider(
        [
            { language: "bat" },
            { language: "bat", scheme: "file" }
        ],
        new BatPathCompletionProvider(),
        "\\",
        "/",
        ".",
        " ",
        "\""
    );

    context.subscriptions.push(provider);

    console.log("BAT Path IntelliSense activated");
}

export function deactivate() {
    provider?.dispose();
}

class BatPathCompletionProvider
    implements vscode.CompletionItemProvider {

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] | undefined {

        if (document.languageId !== "bat") {
            return undefined;
        }

        const config = vscode.workspace.getConfiguration(
            "batPathIntellisense"
        );

        if (!config.get<boolean>("autoTrigger", true)) {
            return undefined;
        }

        const line = document.lineAt(position.line).text;

        const textBeforeCursor = line.substring(
            0,
            position.character
        );

        const pathInfo = extractPath(textBeforeCursor);

        if (!pathInfo) {
            return undefined;
        }

        const batFile = document.uri.fsPath;

        if (!batFile) {
            return undefined;
        }

        const batDirectory = path.dirname(batFile);

        const resolved = resolvePath(
            batDirectory,
            pathInfo.path
        );

        if (!resolved) {
            return undefined;
        }

        if (!fs.existsSync(resolved.directory)) {
            return undefined;
        }

        let entries: fs.Dirent[];

        try {
            entries = fs.readdirSync(
                resolved.directory,
                {
                    withFileTypes: true
                }
            );
        } catch {
            return undefined;
        }

        const showFiles =
            config.get<boolean>("showFiles", true);

        const showDirectories =
            config.get<boolean>("showDirectories", true);

        const result: vscode.CompletionItem[] = [];

        for (const entry of entries) {

            const isDirectory = entry.isDirectory();
            const isFile = entry.isFile();

            if (isDirectory && !showDirectories) {
                continue;
            }

            if (isFile && !showFiles) {
                continue;
            }

            if (!isDirectory && !isFile) {
                continue;
            }

            const name = entry.name;

            // Windows 文件名大小写通常不敏感
            if (
                resolved.filter &&
                !name
                    .toLowerCase()
                    .startsWith(
                        resolved.filter.toLowerCase()
                    )
            ) {
                continue;
            }

            const item = new vscode.CompletionItem(
                name,
                isDirectory
                    ? vscode.CompletionItemKind.Folder
                    : vscode.CompletionItemKind.File
            );

            item.detail = isDirectory
                ? "Directory"
                : "File";

            if (isDirectory) {
                item.label = `${name}\\`;

                item.insertText = new vscode.SnippetString(
                    escapeCompletionText(name) + "\\$0"
                );
            } else {
                item.insertText = escapeCompletionText(name);
            }

            // 让 VS Code 用文件名进行过滤
            item.filterText = name;

            // 替换当前正在输入的路径部分
            item.range = new vscode.Range(
                position.translate(
                    0,
                    -resolved.filter.length
                ),
                position
            );

            result.push(item);
        }

        return result;
    }
}


/**
 * 从光标前的文本中提取“可能正在输入的路径”。
 *
 * 支持：
 *
 * copy .\
 * copy .\abc\
 * copy ..\
 * copy ..\abc\
 * copy abc\
 * copy "abc\
 */
function extractPath(
    text: string
): { path: string } | undefined {

    // 取最后一个空白字符之后的内容
    //
    // 例如：
    //
    // copy .\abc\
    //      ^^^^^^^
    //
    // xcopy /E .\assets\
    //             ^^^^^
    //
    const match = text.match(
        /(?:^|\s|["'])((?:\.\.?[\\/]|[A-Za-z]:[\\/]|[^"' \t]+[\\/])[^"' \t]*)$/
    );

    if (!match) {
        return undefined;
    }

    return {
        path: match[1]
    };
}


/**
 * 把 BAT 中的路径解析成：
 *
 * directory = 要扫描的真实目录
 * filter    = 当前正在输入的文件名前缀
 */
function resolvePath(
    baseDirectory: string,
    inputPath: string
): {
    directory: string;
    filter: string;
} | undefined {

    if (!inputPath) {
        return undefined;
    }

    // BAT 通常使用 \
    // 同时允许 /
    let normalized = inputPath.replace(/\//g, "\\");

    //
    // 绝对 Windows 路径
    //
    if (/^[A-Za-z]:\\/.test(normalized)) {

        const parsed = splitDirectoryAndFilter(
            normalized
        );

        return {
            directory: parsed.directory,
            filter: parsed.filter
        };
    }

    //
    // UNC 路径
    //
    if (normalized.startsWith("\\\\")) {

        const parsed = splitDirectoryAndFilter(
            normalized
        );

        return {
            directory: parsed.directory,
            filter: parsed.filter
        };
    }

    //
    // 相对路径
    //
    const absolute = path.resolve(
        baseDirectory,
        normalized
    );

    //
    // 如果用户已经输入到一个真实目录：
    //
    // .\assets\
    //
    // 那么直接扫描 assets
    //
    if (
        normalized.endsWith("\\") &&
        fs.existsSync(absolute)
    ) {

        try {
            if (fs.statSync(absolute).isDirectory()) {
                return {
                    directory: absolute,
                    filter: ""
                };
            }
        } catch {
            return undefined;
        }
    }

    //
    // 否则把最后一段当作过滤条件
    //
    const parsed = splitDirectoryAndFilter(
        absolute
    );

    return {
        directory: parsed.directory,
        filter: parsed.filter
    };
}


/**
 * 将：
 *
 * C:\project\assets\abc
 *
 * 分成：
 *
 * directory = C:\project\assets
 * filter    = abc
 */
function splitDirectoryAndFilter(
    input: string
): {
    directory: string;
    filter: string;
} {

    let value = input;

    //
    // 路径末尾 \ 表示正在查看这个目录
    //
    if (value.endsWith("\\")) {
        return {
            directory: value,
            filter: ""
        };
    }

    const separator = value.lastIndexOf("\\");

    if (separator < 0) {
        return {
            directory: path.dirname(value),
            filter: path.basename(value)
        };
    }

    return {
        directory: value.substring(
            0,
            separator + 1
        ),
        filter: value.substring(
            separator + 1
        )
    };
}


/**
 * VS Code Snippet 中需要转义的字符。
 */
function escapeCompletionText(
    value: string
): string {

    return value
        .replace(/\\/g, "\\\\")
        .replace(/\$/g, "\\$")
        .replace(/}/g, "\\}");
}
