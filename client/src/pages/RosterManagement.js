import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button, Upload, Table, Input, Select, Modal, message, Popconfirm,
  Empty, Spin, Tag, Space, Tooltip, Checkbox, Steps
} from 'antd';
import {
  SearchOutlined, DeleteOutlined, FileExcelOutlined,
  TableOutlined, CheckOutlined, ReloadOutlined,
  FileTextOutlined, FilterOutlined, LeftOutlined, RightOutlined,
  EditOutlined, ArrowUpOutlined, ArrowDownOutlined, SettingOutlined
} from '@ant-design/icons';
import { rosterApi } from '../api/crmApi';

export default function RosterManagement() {
  // 名单列表
  const [rosters, setRosters] = useState([]);
  const [loading, setLoading] = useState(false);
  // 当前选中的名单 ID（单名单模式，不再支持聚合）
  const [selectedRosterId, setSelectedRosterId] = useState(null);
  // 当前展示的数据（搜索/筛选结果）
  const [displayData, setDisplayData] = useState([]);
  // 搜索关键字
  const [keyword, setKeyword] = useState('');
  // 字段筛选条件 {列名: [片段1, 片段2, ...]}（列内 OR，列间 AND）
  const [filters, setFilters] = useState({});
  // 列值缓存：{ [rosterId_column]: string[] }
  const [columnValueCache, setColumnValueCache] = useState({});
  // 当前选中名单的完整数据（用于查看详情）
  const [detailRoster, setDetailRoster] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // 管理名单弹窗：重命名 + 调整顺序
  const [manageModalVisible, setManageModalVisible] = useState(false);
  // 管理弹窗中的本地编辑列表（支持上移/下移调整顺序、重命名）
  const [editRosterList, setEditRosterList] = useState([]);
  // 当前正在重命名的名单 ID
  const [renamingId, setRenamingId] = useState(null);
  // 重命名输入值
  const [renamingValue, setRenamingValue] = useState('');
  // 保存顺序 loading
  const [savingOrder, setSavingOrder] = useState(false);

  // 上传 / 确认导入相关状态
  // 流程：上传 → parse 返回所有工作表 → 用户勾选要导入的工作表 → 逐一确认名单名称与数据 → 落库
  const [parsing, setParsing] = useState(false);
  // 解析得到的所有工作表
  const [parsedSheets, setParsedSheets] = useState([]);
  // 导入弹窗可见性
  const [importModalVisible, setImportModalVisible] = useState(false);
  // 导入流程当前步骤：'select' 选择工作表 | 'confirm' 逐一确认
  const [importStep, setImportStep] = useState('select');
  // 用户勾选要导入的工作表索引集合
  const [selectedSheetIndices, setSelectedSheetIndices] = useState([]);
  // 逐一确认时的当前位置（在 selectedSheetIndices 中的下标）
  const [confirmCursor, setConfirmCursor] = useState(0);
  // 每个待导入工作表的名单名称 { [sheetIndex]: name }
  const [sheetNames, setSheetNames] = useState({});
  // 每个待导入工作表所选字段 { [sheetIndex]: string[] }（默认全部勾选）
  const [sheetSelectedColumns, setSheetSelectedColumns] = useState({});
  // 每个待导入工作表的可筛选字段 { [sheetIndex]: string[] }（默认等于已选字段）
  const [sheetFilterableColumns, setSheetFilterableColumns] = useState({});
  // 当前是否正在保存某个工作表
  const [saving, setSaving] = useState(false);

  // 管理弹窗中编辑可筛选字段的状态
  const [filterableEditRoster, setFilterableEditRoster] = useState(null);
  const [filterableEditValue, setFilterableEditValue] = useState([]);
  const [filterableSaving, setFilterableSaving] = useState(false);

  // ====== 数据加载 ======
  const fetchRosters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rosterApi.getAll();
      if (res.data?.success) {
        const list = res.data.data;
        setRosters(list);
        // 默认选中第一份名单
        if (list.length > 0 && !selectedRosterId) {
          setSelectedRosterId(list[0].id);
        }
      }
    } catch (err) {
      message.error('加载名单列表失败');
    } finally {
      setLoading(false);
    }
  }, [selectedRosterId]);

  useEffect(() => {
    fetchRosters();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ====== 搜索 / 筛选 ======
  const handleSearch = useCallback(async () => {
    if (!selectedRosterId) {
      setDisplayData([]);
      return;
    }
    setLoading(true);
    try {
      const params = { rosterId: selectedRosterId };
      if (keyword.trim()) params.keyword = keyword.trim();
      // 仅传有值的筛选项
      const activeFilters = {};
      Object.entries(filters).forEach(([col, vals]) => {
        if (Array.isArray(vals) && vals.length > 0) {
          activeFilters[col] = vals;
        }
      });
      if (Object.keys(activeFilters).length > 0) {
        params.filters = JSON.stringify(activeFilters);
      }

      const res = await rosterApi.search(params);
      if (res.data?.success) {
        setDisplayData(res.data.data || []);
      }
    } catch (err) {
      message.error('搜索失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, selectedRosterId, filters]);

  // 切换名单时自动搜索
  useEffect(() => {
    handleSearch();
  }, [selectedRosterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 筛选条件变化时自动搜索（内联筛选行即时反馈）
  useEffect(() => {
    if (!selectedRosterId) return;
    handleSearch();
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  // ====== 上传解析 ======
  const handleBeforeUpload = useCallback(async (file) => {
    setParsing(true);
    try {
      const res = await rosterApi.parse(file);
      if (res.data?.success) {
        const sheets = res.data.data.sheets || [];
        if (sheets.length === 0) {
          message.warning('该 Excel 文件中没有工作表');
          return false;
        }
        setParsedSheets(sheets);
        // 默认勾选所有工作表
        setSelectedSheetIndices(sheets.map((_, i) => i));
        setSheetNames({});
        // 默认每个工作表的所有字段全部勾选
        const initCols = {};
        sheets.forEach((s, i) => { initCols[i] = [...s.columns]; });
        setSheetSelectedColumns(initCols);
        // 默认所有已选字段都可筛选
        const initFilterable = {};
        sheets.forEach((s, i) => { initFilterable[i] = [...s.columns]; });
        setSheetFilterableColumns(initFilterable);
        setImportStep('select');
        setConfirmCursor(0);
        setImportModalVisible(true);
      }
    } catch (err) {
      const msg = err.response?.data?.message || '文件解析失败';
      message.error(msg);
    } finally {
      setParsing(false);
    }
    return false;
  }, []);

  // ====== 确认导入当前工作表 ======
  const handleConfirmSave = useCallback(async () => {
    const sheetIndex = selectedSheetIndices[confirmCursor];
    const sheet = parsedSheets[sheetIndex];
    const name = (sheetNames[sheetIndex] || '').trim();

    if (!name) {
      message.warning('请输入名单名称');
      return;
    }

    // 仅导入用户勾选的字段，及其对应的数据
    const selectedCols = sheetSelectedColumns[sheetIndex] || sheet.columns;
    if (selectedCols.length === 0) {
      message.warning('请至少选择一个字段');
      return;
    }
    const filteredRows = sheet.rows.map(row => {
      const newRow = {};
      selectedCols.forEach(col => { newRow[col] = row[col] !== undefined ? row[col] : ''; });
      return newRow;
    });
    // 可筛选字段：仅保留已选导入字段中的，默认全部可筛选
    const filterableCols = (sheetFilterableColumns[sheetIndex] || selectedCols)
      .filter(c => selectedCols.includes(c));

    setSaving(true);
    try {
      const res = await rosterApi.save({
        name,
        columns: selectedCols,
        rows: filteredRows,
        filterableColumns: filterableCols,
      });
      if (res.data?.success) {
        message.success(`名单「${name}」导入成功，共 ${res.data.data.rowCount} 条记录`);
        await fetchRosters();

        // 移动到下一个待确认的工作表，或完成导入
        if (confirmCursor < selectedSheetIndices.length - 1) {
          setConfirmCursor(confirmCursor + 1);
        } else {
          // 全部确认完毕，关闭弹窗
          setImportModalVisible(false);
          setParsedSheets([]);
          setSelectedSheetIndices([]);
          setSheetNames({});
          setSheetSelectedColumns({});
          setSheetFilterableColumns({});
        }
      }
    } catch (err) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  }, [selectedSheetIndices, confirmCursor, parsedSheets, sheetNames, sheetSelectedColumns, sheetFilterableColumns, fetchRosters]);

  // ====== 跳过当前工作表（不导入） ======
  const handleSkipSheet = useCallback(() => {
    if (confirmCursor < selectedSheetIndices.length - 1) {
      setConfirmCursor(confirmCursor + 1);
    } else {
      // 已经是最后一个，关闭弹窗
      setImportModalVisible(false);
      setParsedSheets([]);
      setSelectedSheetIndices([]);
      setSheetNames({});
      setSheetFilterableColumns({});
      message.info('已跳过该工作表，导入流程结束');
    }
  }, [confirmCursor, selectedSheetIndices.length]);

  // ====== 关闭导入弹窗 ======
  const handleCloseImportModal = useCallback(() => {
    setImportModalVisible(false);
    setParsedSheets([]);
    setSelectedSheetIndices([]);
    setSheetNames({});
    setSheetSelectedColumns({});
    setSheetFilterableColumns({});
    setImportStep('select');
    setConfirmCursor(0);
  }, []);

  // ====== 删除名单 ======
  const handleDelete = useCallback(async (id) => {
    try {
      const res = await rosterApi.delete(id);
      if (res.data?.success) {
        message.success('名单已删除');
        const remaining = rosters.filter(r => r.id !== id);
        setRosters(remaining);
        if (selectedRosterId === id) {
          // 切换到第一份剩余名单，或清空
          setSelectedRosterId(remaining.length > 0 ? remaining[0].id : null);
        }
      }
    } catch (err) {
      message.error('删除失败');
    }
  }, [selectedRosterId, rosters]);

  // ====== 查看名单详情 ======
  const handleViewDetail = useCallback(async (id) => {
    try {
      const res = await rosterApi.getById(id);
      if (res.data?.success) {
        setDetailRoster(res.data.data);
        setDetailModalVisible(true);
      }
    } catch (err) {
      message.error('加载详情失败');
    }
  }, []);

  // ====== 加载列值（用于筛选下拉选项） ======
  const loadColumnValues = useCallback(async (rosterId, column) => {
    const cacheKey = `${rosterId}_${column}`;
    if (columnValueCache[cacheKey]) return;
    try {
      const res = await rosterApi.getColumnValues(rosterId, column);
      if (res.data?.success) {
        setColumnValueCache(prev => ({ ...prev, [cacheKey]: res.data.data }));
      }
    } catch (err) {
      // 静默失败
    }
  }, [columnValueCache]);

  // ====== 管理名单弹窗 ======
  const handleOpenManageModal = useCallback(() => {
    // 打开时以当前 rosters 顺序初始化本地编辑列表（保留 columns/filterable_columns 供编辑使用）
    setEditRosterList(rosters.map(r => ({
      id: r.id,
      name: r.name,
      row_count: r.row_count,
      columns: r.columns,
      filterable_columns: r.filterable_columns,
    })));
    setRenamingId(null);
    setRenamingValue('');
    setManageModalVisible(true);
  }, [rosters]);

  // 上移
  const handleMoveUp = useCallback((idx) => {
    setEditRosterList(prev => {
      if (idx === 0) return prev;
      const arr = [...prev];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr;
    });
  }, []);

  // 下移
  const handleMoveDown = useCallback((idx) => {
    setEditRosterList(prev => {
      if (idx === prev.length - 1) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr;
    });
  }, []);

  // 确认重命名
  const handleConfirmRename = useCallback(async () => {
    const name = renamingValue.trim();
    if (!name) {
      message.warning('名单名称不能为空');
      return;
    }
    try {
      await rosterApi.rename(renamingId, name);
      // 更新本地编辑列表
      setEditRosterList(prev => prev.map(r => r.id === renamingId ? { ...r, name } : r));
      // 同步更新主列表
      setRosters(prev => prev.map(r => r.id === renamingId ? { ...r, name } : r));
      message.success('重命名成功');
      setRenamingId(null);
      setRenamingValue('');
    } catch (err) {
      message.error('重命名失败');
    }
  }, [renamingId, renamingValue]);

  // 保存顺序
  const handleSaveOrder = useCallback(async () => {
    setSavingOrder(true);
    try {
      const rosterIds = editRosterList.map(r => r.id);
      await rosterApi.updateOrder(rosterIds);
      // 同步更新主列表顺序
      setRosters(prev => {
        const map = new Map(prev.map(r => [r.id, r]));
        return rosterIds.map(id => map.get(id)).filter(Boolean);
      });
      message.success('顺序已保存');
      setManageModalVisible(false);
    } catch (err) {
      message.error('保存顺序失败');
    } finally {
      setSavingOrder(false);
    }
  }, [editRosterList]);

  // 当前选中名单的列
  const selectedRoster = useMemo(() => {
    return rosters.find(r => r.id === selectedRosterId) || null;
  }, [selectedRosterId, rosters]);

  // 可筛选字段：优先使用名单保存的 filterable_columns，为空则回退为全部字段
  const filterableColumns = useMemo(() => {
    if (!selectedRoster) return [];
    const fc = selectedRoster.filterable_columns;
    if (Array.isArray(fc) && fc.length > 0) return fc;
    return selectedRoster.columns || [];
  }, [selectedRoster]);

  // 选中名单变化时，自动预加载可筛选列的值（用于内联筛选行）
  // 注意：必须放在 filterableColumns 声明之后，否则会触发 TDZ 报错
  useEffect(() => {
    if (!selectedRosterId) return;
    filterableColumns.forEach(col => loadColumnValues(selectedRosterId, col));
  }, [selectedRosterId, filterableColumns, loadColumnValues]); // eslint-disable-line react-hooks/exhaustive-deps

  // ====== 管理弹窗：编辑可筛选字段 ======
  const handleOpenFilterableEdit = useCallback((roster) => {
    const allCols = Array.isArray(roster.columns) ? roster.columns : [];
    const fc = Array.isArray(roster.filterable_columns) && roster.filterable_columns.length > 0
      ? roster.filterable_columns
      : allCols;
    setFilterableEditRoster({ ...roster, columns: allCols });
    setFilterableEditValue([...fc]);
  }, []);

  const handleSaveFilterableColumns = useCallback(async () => {
    if (!filterableEditRoster) return;
    setFilterableSaving(true);
    try {
      const res = await rosterApi.updateFilterableColumns(filterableEditRoster.id, filterableEditValue);
      if (res.data?.success) {
        // 同步更新主列表与编辑列表
        const updated = res.data.data.filterable_columns;
        setRosters(prev => prev.map(r => r.id === filterableEditRoster.id ? { ...r, filterable_columns: updated } : r));
        setEditRosterList(prev => prev.map(r => r.id === filterableEditRoster.id ? { ...r, filterable_columns: updated } : r));
        message.success('可筛选字段已更新');
        setFilterableEditRoster(null);
        setFilterableEditValue([]);
      }
    } catch (err) {
      message.error('更新可筛选字段失败');
    } finally {
      setFilterableSaving(false);
    }
  }, [filterableEditRoster, filterableEditValue]);

  // 活跃筛选项数量
  const activeFilterCount = useMemo(() => {
    return Object.values(filters).filter(vals => Array.isArray(vals) && vals.length > 0).length;
  }, [filters]);

  // ====== 表格列定义 ======
  const tableColumns = useMemo(() => {
    if (displayData.length === 0) return [];
    const columns = displayData[0].columns;
    return columns.map(colName => ({
      title: colName,
      dataIndex: colName,
      key: colName,
      ellipsis: true,
      width: 150,
      render: (text) => text || <span className="text-gray-300">-</span>,
    }));
  }, [displayData]);

  // 表格数据源
  const tableDataSource = useMemo(() => {
    if (displayData.length === 0) return [];
    const roster = displayData[0];
    return roster.rows.map((row, idx) => ({
      ...row,
      key: `${roster.id}-${idx}`,
    }));
  }, [displayData]);

  // 当前确认步骤中工作表的预览列定义（仅展示用户勾选的字段）
  const currentConfirmSheet = useMemo(() => {
    if (importStep !== 'confirm' || selectedSheetIndices.length === 0) return null;
    const sheetIndex = selectedSheetIndices[confirmCursor];
    return parsedSheets[sheetIndex] || null;
  }, [importStep, selectedSheetIndices, confirmCursor, parsedSheets]);

  // 当前工作表用户已勾选的字段
  const currentSelectedColumns = useMemo(() => {
    if (!currentConfirmSheet) return [];
    const sheetIndex = selectedSheetIndices[confirmCursor];
    return sheetSelectedColumns[sheetIndex] || currentConfirmSheet.columns;
  }, [currentConfirmSheet, sheetSelectedColumns, selectedSheetIndices, confirmCursor]);

  const confirmPreviewColumns = useMemo(() => {
    return currentSelectedColumns.map(colName => ({
      title: colName,
      dataIndex: colName,
      key: colName,
      ellipsis: true,
      width: 150,
    }));
  }, [currentSelectedColumns]);

  // 当前工作表用户已勾选的可筛选字段（仅限已选导入字段内）
  const currentFilterableColumns = useMemo(() => {
    if (!currentConfirmSheet) return [];
    const sheetIdx = selectedSheetIndices[confirmCursor];
    const fc = sheetFilterableColumns[sheetIdx] || currentSelectedColumns;
    return fc.filter(c => currentSelectedColumns.includes(c));
  }, [currentConfirmSheet, sheetFilterableColumns, selectedSheetIndices, confirmCursor, currentSelectedColumns]);

  return (
    <div className="h-full flex flex-col bg-gray-50 relative">
      {/* ====== 顶部工具栏 ====== */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3 shrink-0">
        {/* 名单选择器（单名单模式，无聚合选项） */}
        <Space>
          <span className="text-sm text-gray-500 font-medium">当前名单：</span>
          <Select
            value={selectedRosterId ?? undefined}
            onChange={(v) => { setSelectedRosterId(v); setFilters({}); }}
            style={{ width: 240 }}
            placeholder="请选择名单"
            options={rosters.map(r => ({
              value: r.id,
              label: <span className="flex items-center gap-1.5"><FileTextOutlined />{r.name}</span>,
            }))}
          />
        </Space>

        {/* 搜索框 */}
        <Input
          placeholder="输入关键字搜索..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          allowClear
          prefix={<SearchOutlined className="text-gray-400" />}
          style={{ width: 240 }}
          disabled={!selectedRosterId}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} disabled={!selectedRosterId}>搜索</Button>

        <div className="flex-1" />

        {/* 刷新、管理名单、上传 */}
        <Tooltip title="刷新数据">
          <Button icon={<ReloadOutlined />} onClick={() => { fetchRosters(); handleSearch(); }} />
        </Tooltip>

        {/* 管理名单：打开弹窗进行重命名和排序 */}
        <Button icon={<SettingOutlined />} onClick={handleOpenManageModal} disabled={rosters.length === 0}>
          管理名单
        </Button>

        <Upload accept=".xls,.xlsx" showUploadList={false} beforeUpload={handleBeforeUpload}>
          <Button type="primary" icon={<FileExcelOutlined />} loading={parsing}>
            上传 Excel
          </Button>
        </Upload>
      </div>

      {/* ====== 字段筛选行（内联展示，非抽屉） ====== */}
      {selectedRosterId && filterableColumns.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
            <FilterOutlined />
            <span>字段筛选</span>
            {activeFilterCount > 0 && <Tag color="blue" className="m-0 ml-0.5">{activeFilterCount}</Tag>}
          </div>
          {filterableColumns.map(col => {
            const selectedVals = filters[col] || [];
            return (
              <div key={col} className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 shrink-0">{col}：</span>
                <Select
                  mode="multiple"
                  allowClear
                  size="small"
                  style={{ minWidth: 140, maxWidth: 280 }}
                  placeholder="输入或选择"
                  value={selectedVals}
                  onChange={(vals) => setFilters(prev => {
                    const next = { ...prev };
                    if (vals.length > 0) next[col] = vals;
                    else delete next[col];
                    return next;
                  })}
                  options={(columnValueCache[`${selectedRosterId}_${col}`] || []).map(v => ({ value: v, label: v }))}
                  maxTagTextLength={10}
                />
              </div>
            );
          })}
          {activeFilterCount > 0 && (
            <Button size="small" type="link" onClick={() => setFilters({})}>清空筛选</Button>
          )}
        </div>
      )}

      {/* ====== 数据表格 ====== */}
      <div className="flex-1 overflow-auto p-4">
        {!selectedRosterId ? (
          <Empty
            className="py-20 bg-white rounded-xl border border-dashed border-gray-200"
            description={rosters.length === 0 ? '暂无名单数据，点击右上角上传 Excel 文件' : '请选择一份名单查看数据'}
          />
        ) : loading ? (
          <div className="flex justify-center items-center py-20"><Spin size="large" /></div>
        ) : tableDataSource.length > 0 ? (
          <Table
            dataSource={tableDataSource}
            columns={tableColumns}
            pagination={{
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              pageSizeOptions: ['10', '20', '50', '100'],
              defaultPageSize: 20,
            }}
            scroll={{ x: 'max-content' }}
            size="small"
            className="bg-white rounded-lg border border-gray-100"
          />
        ) : (
          <Empty
            className="py-20 bg-white rounded-xl border border-dashed border-gray-200"
            description="该名单暂无数据或无匹配结果"
          />
        )}
      </div>

      {/* ====== 管理名单弹窗：重命名 + 调整顺序 ====== */}
      <Modal
        title="管理名单"
        open={manageModalVisible}
        onCancel={() => setManageModalVisible(false)}
        width={600}
        footer={[
          <Button key="cancel" onClick={() => setManageModalVisible(false)}>关闭</Button>,
          <Button key="save" type="primary" icon={<CheckOutlined />} loading={savingOrder} onClick={handleSaveOrder}>
            保存顺序
          </Button>,
        ]}
        destroyOnHidden
      >
        {editRosterList.length === 0 ? (
          <Empty description="暂无名单" />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="text-xs text-gray-400 mb-1">
              点击「编辑」重命名名单，使用上下箭头调整显示顺序，最后点击「保存顺序」。
            </div>
            {editRosterList.map((roster, idx) => (
              <div
                key={roster.id}
                className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="text"
                    size="small"
                    icon={<ArrowUpOutlined />}
                    disabled={idx === 0}
                    onClick={() => handleMoveUp(idx)}
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<ArrowDownOutlined />}
                    disabled={idx === editRosterList.length - 1}
                    onClick={() => handleMoveDown(idx)}
                  />
                </div>

                <span className="text-xs text-gray-400 w-6 text-center">{idx + 1}</span>

                <div className="flex-1 min-w-0">
                  {renamingId === roster.id ? (
                    <Input
                      size="small"
                      value={renamingValue}
                      onChange={(e) => setRenamingValue(e.target.value)}
                      onPressEnter={handleConfirmRename}
                      autoFocus
                      suffix={
                        <Space size={0}>
                          <Button type="link" size="small" onClick={handleConfirmRename}>保存</Button>
                          <Button type="link" size="small" danger onClick={() => { setRenamingId(null); setRenamingValue(''); }}>取消</Button>
                        </Space>
                      }
                    />
                  ) : (
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-800 truncate">{roster.name}</span>
                      <span className="text-xs text-gray-400">{roster.row_count} 条数据</span>
                    </div>
                  )}
                </div>

                {renamingId !== roster.id && (
                  <Space>
                    <Tooltip title="重命名">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => { setRenamingId(roster.id); setRenamingValue(roster.name); }}
                      />
                    </Tooltip>
                    <Tooltip title="可筛选字段">
                      <Button
                        type="text"
                        size="small"
                        icon={<FilterOutlined />}
                        onClick={() => handleOpenFilterableEdit(roster)}
                      />
                    </Tooltip>
                    <Tooltip title="查看详情">
                      <Button
                        type="text"
                        size="small"
                        icon={<FileTextOutlined />}
                        onClick={() => handleViewDetail(roster.id)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="确认删除该名单？"
                      description="删除后数据不可恢复"
                      onConfirm={() => handleDelete(roster.id)}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ====== 导入弹窗：选择工作表 + 逐一确认 ====== */}
      <Modal
        title={importStep === 'select' ? '选择要导入的工作表' : `确认导入数据（第 ${confirmCursor + 1} / ${selectedSheetIndices.length} 份）`}
        open={importModalVisible}
        onCancel={handleCloseImportModal}
        width={1000}
        footer={
          importStep === 'select' ? [
            <Button key="cancel" onClick={handleCloseImportModal}>取消</Button>,
            <Button
              key="next"
              type="primary"
              icon={<RightOutlined />}
              disabled={selectedSheetIndices.length === 0}
              onClick={() => {
                setImportStep('confirm');
                setConfirmCursor(0);
              }}
            >
              开始逐一确认（{selectedSheetIndices.length} 份）
            </Button>,
          ] : [
            <Button key="cancel" onClick={handleCloseImportModal}>取消导入</Button>,
            <Button
              key="skip"
              icon={<RightOutlined />}
              onClick={handleSkipSheet}
              disabled={saving}
            >
              跳过此表
            </Button>,
            <Button
              key="prev"
              icon={<LeftOutlined />}
              onClick={() => setConfirmCursor(Math.max(0, confirmCursor - 1))}
              disabled={confirmCursor === 0 || saving}
            >
              上一份
            </Button>,
            <Button
              key="confirm"
              type="primary"
              icon={<CheckOutlined />}
              loading={saving}
              onClick={handleConfirmSave}
            >
              {confirmCursor < selectedSheetIndices.length - 1 ? '确认并导入下一份' : '确认导入'}
            </Button>,
          ]
        }
        destroyOnHidden
      >
        {/* 步骤一：选择要导入的工作表 */}
        {importStep === 'select' && parsedSheets.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-gray-500 leading-relaxed">
              该 Excel 文件包含 {parsedSheets.length} 个工作表，请勾选要导入的工作表，随后逐一确认名单名称与数据。
            </div>
            <div className="flex flex-col gap-2">
              {parsedSheets.map((sheet, idx) => (
                <label
                  key={idx}
                  className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <Checkbox
                    checked={selectedSheetIndices.includes(idx)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSheetIndices(prev => [...prev, idx].sort((a, b) => a - b));
                      } else {
                        setSelectedSheetIndices(prev => prev.filter(i => i !== idx));
                      }
                    }}
                  />
                  <TableOutlined className="text-blue-400" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800">{sheet.sheetName}</div>
                    <div className="text-xs text-gray-400">
                      {sheet.rowCount} 条数据 · {sheet.columns.length} 个字段
                    </div>
                  </div>
                  {sheet.rowCount === 0 && <Tag color="default">空表</Tag>}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 步骤二：逐一确认名单名称与数据 */}
        {importStep === 'confirm' && currentConfirmSheet && (
          <div className="flex flex-col gap-4">
            {/* 步骤进度条 */}
            <Steps
              size="small"
              current={confirmCursor}
              items={selectedSheetIndices.map((sheetIdx, i) => ({
                title: parsedSheets[sheetIdx].sheetName,
                status: i < confirmCursor ? 'finish' : (i === confirmCursor ? 'process' : 'wait'),
              }))}
            />

            {/* 当前工作表信息 */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-center gap-4">
              <FileExcelOutlined className="text-3xl text-green-500" />
              <div className="flex-1">
                <div className="font-medium text-gray-800">工作表「{currentConfirmSheet.sheetName}」</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {currentConfirmSheet.rowCount} 条数据 · {currentConfirmSheet.columns.length} 个字段 · 已选 {currentSelectedColumns.length} 个字段 · 可筛选 {currentFilterableColumns.length} 个字段
                </div>
              </div>
            </div>

            {/* 名单命名 */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">名单名称</label>
              <Input
                value={sheetNames[selectedSheetIndices[confirmCursor]] || ''}
                onChange={(e) => {
                  const sheetIdx = selectedSheetIndices[confirmCursor];
                  setSheetNames(prev => ({ ...prev, [sheetIdx]: e.target.value }));
                }}
                placeholder="为这份名单取一个名称"
                size="large"
              />
            </div>

            {/* 字段选择 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">导入字段</label>
                <Space size={0}>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      const sheetIdx = selectedSheetIndices[confirmCursor];
                      setSheetSelectedColumns(prev => ({ ...prev, [sheetIdx]: [...currentConfirmSheet.columns] }));
                      setSheetFilterableColumns(prev => ({ ...prev, [sheetIdx]: [...currentConfirmSheet.columns] }));
                    }}
                  >
                    全选
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      const sheetIdx = selectedSheetIndices[confirmCursor];
                      setSheetSelectedColumns(prev => ({ ...prev, [sheetIdx]: [] }));
                      setSheetFilterableColumns(prev => ({ ...prev, [sheetIdx]: [] }));
                    }}
                  >
                    清空
                  </Button>
                </Space>
              </div>
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 border border-gray-100 rounded-lg max-h-32 overflow-y-auto">
                {currentConfirmSheet.columns.map(col => {
                  const sheetIdx = selectedSheetIndices[confirmCursor];
                  const checked = (sheetSelectedColumns[sheetIdx] || []).includes(col);
                  return (
                    <Checkbox
                      key={col}
                      checked={checked}
                      onChange={(e) => {
                        const sheetIdx = selectedSheetIndices[confirmCursor];
                        setSheetSelectedColumns(prev => {
                          const cur = prev[sheetIdx] || [];
                          let next;
                          if (e.target.checked) {
                            // 保持原始列顺序
                            next = currentConfirmSheet.columns.filter(c => cur.includes(c) || c === col);
                          } else {
                            next = cur.filter(c => c !== col);
                          }
                          // 同步清理可筛选字段：取消导入的字段不再可筛选
                          setSheetFilterableColumns(prevF => {
                            const curF = prevF[sheetIdx] || [];
                            const nextF = next.filter(c => curF.includes(c));
                            // 默认新增的导入字段也加入可筛选
                            const newAdded = next.filter(c => !cur.includes(c));
                            return { ...prevF, [sheetIdx]: [...nextF, ...newAdded] };
                          });
                          return { ...prev, [sheetIdx]: next };
                        });
                      }}
                    >
                      <span className="text-xs">{col}</span>
                    </Checkbox>
                  );
                })}
              </div>
            </div>

            {/* 可筛选字段选择（仅从已选导入字段中选取） */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">
                  可筛选字段
                  <span className="text-xs text-gray-400 font-normal ml-2">勾选后该字段将出现在顶部筛选行中</span>
                </label>
                <Space size={0}>
                  <Button
                    type="link"
                    size="small"
                    disabled={currentSelectedColumns.length === 0}
                    onClick={() => {
                      const sheetIdx = selectedSheetIndices[confirmCursor];
                      setSheetFilterableColumns(prev => ({ ...prev, [sheetIdx]: [...currentSelectedColumns] }));
                    }}
                  >
                    全选
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    disabled={currentSelectedColumns.length === 0}
                    onClick={() => {
                      const sheetIdx = selectedSheetIndices[confirmCursor];
                      setSheetFilterableColumns(prev => ({ ...prev, [sheetIdx]: [] }));
                    }}
                  >
                    清空
                  </Button>
                </Space>
              </div>
              <div className="flex flex-wrap gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg max-h-32 overflow-y-auto">
                {currentSelectedColumns.length === 0 ? (
                  <span className="text-xs text-gray-400">请先选择导入字段</span>
                ) : currentSelectedColumns.map(col => {
                  const sheetIdx = selectedSheetIndices[confirmCursor];
                  const checked = (sheetFilterableColumns[sheetIdx] || []).includes(col);
                  return (
                    <Checkbox
                      key={col}
                      checked={checked}
                      onChange={(e) => {
                        setSheetFilterableColumns(prev => {
                          const cur = prev[sheetIdx] || [];
                          if (e.target.checked) {
                            // 保持导入字段顺序
                            const next = currentSelectedColumns.filter(c => cur.includes(c) || c === col);
                            return { ...prev, [sheetIdx]: next };
                          } else {
                            return { ...prev, [sheetIdx]: cur.filter(c => c !== col) };
                          }
                        });
                      }}
                    >
                      <span className="text-xs">{col}</span>
                    </Checkbox>
                  );
                })}
              </div>
            </div>

            {/* 数据预览表格（仅展示已勾选的字段） */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">数据预览（前 100 行）</span>
                <span className="text-xs text-gray-400">请确认数据无误后点击「确认导入」</span>
              </div>
              {currentSelectedColumns.length === 0 ? (
                <Empty description="请至少选择一个字段" className="py-10 border border-gray-100 rounded-lg" />
              ) : (
                <Table
                  dataSource={currentConfirmSheet.rows.slice(0, 100).map((row, idx) => {
                    const filtered = { key: idx };
                    currentSelectedColumns.forEach(col => { filtered[col] = row[col]; });
                    return filtered;
                  })}
                  columns={confirmPreviewColumns}
                  pagination={false}
                  scroll={{ x: 'max-content', y: 400 }}
                  size="small"
                  className="border border-gray-100 rounded-lg"
                />
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ====== 名单详情弹窗 ====== */}
      <Modal
        title={detailRoster ? `名单详情 - ${detailRoster.name}` : '名单详情'}
        open={detailModalVisible}
        onCancel={() => { setDetailModalVisible(false); setDetailRoster(null); }}
        width={1000}
        footer={null}
        destroyOnHidden
      >
        {detailRoster && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
              <span>记录数：<span className="text-gray-700">{detailRoster.row_count}</span></span>
              <span>字段数：<span className="text-gray-700">{detailRoster.columns.length}</span></span>
              <span>上传时间：<span className="text-gray-700">{detailRoster.uploaded_at}</span></span>
            </div>
            <Table
              dataSource={detailRoster.rows.map((row, idx) => ({ ...row, key: idx }))}
              columns={detailRoster.columns.map(col => ({
                title: col,
                dataIndex: col,
                key: col,
                ellipsis: true,
                width: 150,
              }))}
              pagination={{
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                defaultPageSize: 20,
              }}
              scroll={{ x: 'max-content' }}
              size="small"
              className="border border-gray-100 rounded-lg"
            />
          </div>
        )}
      </Modal>

      {/* ====== 可筛选字段编辑弹窗 ====== */}
      <Modal
        title={filterableEditRoster ? `可筛选字段 - ${filterableEditRoster.name}` : '可筛选字段'}
        open={!!filterableEditRoster}
        onCancel={() => { setFilterableEditRoster(null); setFilterableEditValue([]); }}
        width={560}
        footer={[
          <Button key="cancel" onClick={() => { setFilterableEditRoster(null); setFilterableEditValue([]); }}>取消</Button>,
          <Button key="save" type="primary" icon={<CheckOutlined />} loading={filterableSaving} onClick={handleSaveFilterableColumns}>
            保存
          </Button>,
        ]}
        destroyOnHidden
      >
        {filterableEditRoster && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">勾选允许在筛选行中使用的字段</span>
              <Space size={0}>
                <Button
                  type="link"
                  size="small"
                  onClick={() => setFilterableEditValue([...filterableEditRoster.columns])}
                >
                  全选
                </Button>
                <Button
                  type="link"
                  size="small"
                  onClick={() => setFilterableEditValue([])}
                >
                  清空
                </Button>
              </Space>
            </div>
            <div className="flex flex-wrap gap-2 p-3 bg-gray-50 border border-gray-100 rounded-lg max-h-64 overflow-y-auto">
              {filterableEditRoster.columns.map(col => {
                const checked = filterableEditValue.includes(col);
                return (
                  <Checkbox
                    key={col}
                    checked={checked}
                    onChange={(e) => {
                      setFilterableEditValue(prev => {
                        if (e.target.checked) {
                          // 保持原始列顺序
                          return filterableEditRoster.columns.filter(c => prev.includes(c) || c === col);
                        } else {
                          return prev.filter(c => c !== col);
                        }
                      });
                    }}
                  >
                    <span className="text-xs">{col}</span>
                  </Checkbox>
                );
              })}
            </div>
            <div className="text-xs text-gray-400">
              已选 {filterableEditValue.length} / {filterableEditRoster.columns.length} 个字段
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
