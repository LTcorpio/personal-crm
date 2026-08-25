// Package excel 统一解析 .xls / .xlsx 文件，产出与 Node 版（SheetJS sheet_to_json
// + defval:” + raw:false）一致的工作表预览结构。
//
// 关键语义（经 xlsx@0.18.5 实测确认）：
//   - 首个非空行作为表头，空行（无任何内容的行）全部跳过；
//   - 有数据行时：缺失表头命名 __EMPTY / __EMPTY_1 / __EMPTY_2...，
//     重复表头追加 _1 / _2... 后缀；
//   - 仅表头无数据行时：列名直接取表头单元格，缺失列命名为 列N；
//   - 完全空表：列名为 ["列1"]（对应 decode_range('A1')）。
package excel

import (
	"fmt"
	"strings"

	"github.com/extrame/xls"
	"github.com/xuri/excelize/v2"
)

// Sheet 单个工作表的解析结果（JSON 字段名与 Node 版响应保持一致）。
type Sheet struct {
	SheetName  string              `json:"sheetName"`
	SheetIndex int                 `json:"sheetIndex"`
	Columns    []string            `json:"columns"`
	Rows       []map[string]string `json:"rows"`
	RowCount   int                 `json:"rowCount"`
}

// Parse 根据扩展名解析 Excel 文件，返回所有工作表。
func Parse(path, ext string) ([]Sheet, error) {
	if strings.EqualFold(ext, ".xlsx") {
		return parseXLSX(path)
	}
	return parseXLS(path)
}

// parseXLSX 基于 excelize 解析 .xlsx（GetRows 返回格式化后的字符串值）。
func parseXLSX(path string) ([]Sheet, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	names := f.GetSheetList()
	sheets := make([]Sheet, 0, len(names))
	for i, name := range names {
		rows, err := f.GetRows(name)
		if err != nil {
			return nil, err
		}
		sheets = append(sheets, buildSheet(name, i, rows))
	}
	return sheets, nil
}

// parseXLS 基于 extrame/xls 解析 .xls。
func parseXLS(path string) ([]Sheet, error) {
	wb, err := xls.Open(path, "utf-8")
	if err != nil {
		return nil, err
	}

	count := wb.NumSheets()
	sheets := make([]Sheet, 0, count)
	for i := 0; i < count; i++ {
		sh := wb.GetSheet(i)
		if sh == nil {
			sheets = append(sheets, buildSheet(fmt.Sprintf("Sheet%d", i+1), i, nil))
			continue
		}

		// Row(i) 为 nil 表示该行没有数据记录（空行）
		var raw [][]string
		for r := 0; r <= int(sh.MaxRow); r++ {
			row := sh.Row(r)
			if row == nil {
				continue
			}
			raw = append(raw, rowValues(row))
		}
		sheets = append(sheets, buildSheet(sh.Name, i, raw))
	}
	return sheets, nil
}

// rowValues 读取 .xls 一行的各列值（LastCol 为最后一列的下一列索引）。
func rowValues(row *xls.Row) []string {
	n := row.LastCol()
	if n < 0 {
		n = 0
	}
	vals := make([]string, n)
	for c := 0; c < n; c++ {
		vals[c] = row.Col(c)
	}
	return vals
}

// buildSheet 将原始行数据规整为工作表结构（表头推导 + 空行过滤）。
func buildSheet(name string, index int, raw [][]string) Sheet {
	// 去掉前导空行：SheetJS 的使用范围从首个有内容的行开始
	start := 0
	for start < len(raw) && allEmpty(raw[start]) {
		start++
	}
	raw = raw[start:]

	if len(raw) == 0 {
		return Sheet{
			SheetName:  name,
			SheetIndex: index,
			Columns:    []string{"列1"},
			Rows:       []map[string]string{},
			RowCount:   0,
		}
	}

	header := raw[0]

	// 是否存在至少一个非空数据行
	hasData := false
	for _, row := range raw[1:] {
		if !allEmpty(row) {
			hasData = true
			break
		}
	}

	// 总列数：表头宽度与数据行最大宽度的较大者（对齐 SheetJS 使用范围）
	totalCols := len(header)
	for _, row := range raw[1:] {
		if len(row) > totalCols {
			totalCols = len(row)
		}
	}

	columns := make([]string, totalCols)
	if !hasData {
		// 仅表头：列名直接取表头单元格，缺失的列命名为 列N
		for c := 0; c < totalCols; c++ {
			h := header[c] // len(header) == totalCols，此时不会越界
			if h != "" {
				columns[c] = h
			} else {
				columns[c] = fmt.Sprintf("列%d", c+1)
			}
		}
	} else {
		// 有数据行：缺失表头命名 __EMPTY，重复列名追加序号后缀
		seen := make(map[string]bool, totalCols)
		for c := 0; c < totalCols; c++ {
			h := ""
			if c < len(header) {
				h = header[c]
			}
			if h == "" {
				h = "__EMPTY"
			}
			base := h
			for n := 1; seen[h]; n++ {
				h = fmt.Sprintf("%s_%d", base, n)
			}
			seen[h] = true
			columns[c] = h
		}
	}

	rows := make([]map[string]string, 0)
	for _, row := range raw[1:] {
		if allEmpty(row) {
			continue
		}
		obj := make(map[string]string, totalCols)
		for c, col := range columns {
			v := ""
			if c < len(row) {
				v = row[c]
			}
			obj[col] = v
		}
		rows = append(rows, obj)
	}

	return Sheet{
		SheetName:  name,
		SheetIndex: index,
		Columns:    columns,
		Rows:       rows,
		RowCount:   len(rows),
	}
}

func allEmpty(row []string) bool {
	for _, v := range row {
		if v != "" {
			return false
		}
	}
	return true
}
