import React, { useState, useMemo, useEffect } from 'react';
import { Card, Tabs, Radio, Button, Input, Checkbox, Row, Col, Space, Typography } from 'antd';
import { UndoOutlined, DeleteOutlined } from '@ant-design/icons';
import relationship from 'relationship.js';

const { TextArea } = Input;
const { Title, Text } = Typography;

export default function RelationshipCalculator() {
  // 安全获取全局关系计算核心库
  const relCore = relationship;

  // ==================== 1. 初始化并补充方言数据 ====================
  useEffect(() => {
    if (relCore && relCore.setMode) {
      const relationshipModeData = {
        guangdong: {
          f: ["老窦"], "f,f": ["阿爷"], "f,f,f": ["太公"], "f,f,m": ["太婆"], "f,m": ["阿嫲"],
          "f,m,f": ["太外公"], "f,m,m": ["太外婆"], "f,ob": ["伯伯"], "f,ob,w": ["伯娘"],
          "f,lb": ["阿叔"], "f,lb,w": ["阿婶"], "0,f,xb,d,s": ["堂姨甥"], "1,f,xb,d,s": ["堂外甥"],
          "0,f,xb,d,d": ["堂姨甥女"], "1,f,xb,d,d": ["堂外甥女"], "f,os": ["姑母"], "f,ls": ["姑姐"],
          "f,xs,h": ["姑丈"], "0,f,xs,d,s": ["姑表姨甥"], "1,f,xs,d,s": ["姑表外甥"],
          "0,f,xs,d,d": ["姑表姨甥女"], "1,f,xs,d,d": ["姑表外甥女"], m: ["老母"], "m,f": ["阿公"],
          "m,f,f": ["外太公"], "m,f,m": ["外太婆"], "m,m": ["阿婆"], "m,m,f": ["外太外公"],
          "m,m,m": ["外太外婆"], "m,ob": ["舅父"], "m,lb": ["舅仔"], "m,xb,w": ["舅母"],
          "0,m,xb,d,s": ["舅表姨甥"], "1,m,xb,d,s": ["舅表外甥"], "0,m,xb,d,d": ["舅表姨甥女"],
          "1,m,xb,d,d": ["舅表外甥女"], "m,os": ["姨妈"], "m,ls": ["姨仔"], "m,xs,h": ["姨丈"],
          "0,m,xb,d,s": ["姨姨甥"], "1,m,xb,d,s": ["姨外甥"], "0,m,xb,d,d": ["姨姨甥女"],
          "1,m,xb,d,d": ["姨外甥女"], ob: ["大佬"], "ob,w": ["阿嫂"], lb: ["细佬"], "lb,w": ["弟妇"],
          "xb,s": ["侄"], "xb,d": ["侄女"], os: ["家姐"], "os,h": ["姐夫"], ls: ["阿妹"],
          "ls,h": ["妹夫"], "0,xs,s": ["姨甥"], "1,xs,s": ["外甥"], "0,xs,d": ["姨甥女"],
          "1,xs,d": ["外甥女"], s: ["仔"], "s,w": ["新妇"], "s,s": ["孙"], "s,s,w": ["孙新妇"],
          "s,s,s": ["息仔"], "s,s,d": ["息女"], "s,d": ["孙女"], "s,d,h": ["孙女婿"],
          "s,d,s": ["外息仔"], "s,d,d": ["外息女"], d: ["女"], "d,s": ["外慢"], "d,s,w": ["外慢新妇"],
          "d,s,s": ["外息仔"], "d,s,d": ["外息女"], "d,d": ["外孙女"], "d,d,h": ["外孙女婿"],
          "d,d,s": ["外息仔"], "d,d,d": ["外息女"]
        },
        north: {
          "m,m": ["姥姥"], "m,m,xs": ["姨姥姥"], "m,m,xs,h": ["姨姥爷"], "m,m,xb": ["舅姥爷"],
          "m,m,xb,w": ["舅姥姥"], "m,f": ["姥爷"], "m,f,xs": ["姑姥姥"], "m,f,xs,h": ["姑姥爷"],
          "m,f,ob": ["大姥爷"], "m,f,ob,w": ["大姥姥"], "m,f,lb": ["小姥爷"], "m,f,lb,w": ["小姥姥"],
          "f,ob": ["大爷"], "f,ob,w": ["大娘"]
        }
      };
      for (let key in relationshipModeData) {
        relCore.setMode(key, relationshipModeData[key]);
      }
    }
  }, [relCore]);

  // ==================== Tab 1: 关系找称呼 State & Effects ====================
  const [t1Mode, setT1Mode] = useState('default');
  const [t1Sex, setT1Sex] = useState(1); 
  const [t1Reverse, setT1Reverse] = useState(false); 
  const [t1Input, setT1Input] = useState('');
  const [t1Result, setT1Result] = useState('');

  // 自动识别首个输入词汇修正性别
  useEffect(() => {
    if (!t1Input) return;
    const firstPart = t1Input.trim().split('的')[0];
    if (firstPart === '老公' && t1Sex !== 0) {
      setT1Sex(0);
    } else if (firstPart === '老婆' && t1Sex !== 1) {
      setT1Sex(1);
    }
  }, [t1Input]);

  // 核心响应式同步计算
  useEffect(() => {
    if (!relCore) return;
    if (t1Input.trim()) {
      const res = relCore({
        text: t1Input.trim(),
        sex: t1Sex,
        reverse: t1Reverse,
        mode: t1Mode,
      });
      setT1Result(res && res.length ? res.join('\n') : '貌似他/她跟你不是很熟哦!');
    } else {
      setT1Result('');
    }
  }, [t1Input, t1Mode, t1Sex, t1Reverse, relCore]);

  const t1DisabledKey = useMemo(() => {
    if (!t1Input) return t1Sex === 1 ? '夫' : '妻';
    const parts = t1Input.split('的');
    const last = parts[parts.length - 1];
    if ('爸爸,老公,儿子,哥哥,弟弟,兄弟'.includes(last)) return '夫'; 
    if ('妈妈,老婆,女儿,姐姐,妹妹,姐妹'.includes(last)) return '妻'; 
    return t1Sex === 1 ? '夫' : '妻';
  }, [t1Input, t1Sex]);

  const handleT1BtnClick = (value) => {
    setT1Input((prev) => (prev ? `${prev}的${value}` : value));
  };

  const handleT1Back = () => {
    const parts = t1Input.split('的');
    parts.pop();
    setT1Input(parts.join('的'));
  };

  // ==================== Tab 2: 称呼找关系 State & Effects ====================
  const [t2Input, setT2Input] = useState('');
  const [t2Result, setT2Result] = useState('');

  useEffect(() => {
    if (!relCore) return;
    if (t2Input.trim()) {
      const res = relCore({ text: t2Input.trim(), type: 'chain' });
      setT2Result(res && res.length ? res.join('\n') : '貌似他/她跟你不是很熟哦!');
    } else {
      setT2Result('');
    }
  }, [t2Input, relCore]);

  // ==================== Tab 3: 两者间称呼 State & Effects ====================
  const [t3Optimal, setT3Optimal] = useState(true);
  const [t3Person, setT3Person] = useState('');
  const [t3Target, setT3Target] = useState('');
  const [t3Reverse, setT3Reverse] = useState(true); 
  const [t3Result, setT3Result] = useState('');

  useEffect(() => {
    if (!relCore) return;
    let person = t3Person.trim();
    let target = t3Target.trim();
    if (person && target) {
      if (t3Reverse) { 
        const temp = target;
        target = person;
        person = temp;
      }
      const res = relCore({ text: person, target: target, optimal: t3Optimal });
      setT3Result(res && res.length ? res.join('\n') : '他们貌似不是很熟哦!');
    } else {
      setT3Result('');
    }
  }, [t3Person, t3Target, t3Reverse, t3Optimal, relCore]);

  // ==================== Tab 4: 两者的合称 State & Effects ====================
  const [t4Optimal, setT4Optimal] = useState(true);
  const [t4Person, setT4Person] = useState('');
  const [t4Target, setT4Target] = useState('');
  const [t4Result, setT4Result] = useState('');

  useEffect(() => {
    if (!relCore) return;
    if (t4Person.trim() && t4Target.trim()) {
      const res = relCore({
        text: t4Person.trim(),
        target: t4Target.trim(),
        type: 'pair',
        optimal: t4Optimal,
      });
      setT4Result(res && res.length ? res.join('\n') : '未找到合称!');
    } else {
      setT4Result('');
    }
  }, [t4Person, t4Target, t4Optimal, relCore]);


  // ==================== 3. 渲染页面组件 ====================
  const items = [
    {
      key: '1',
      label: '关系找称呼',
      children: (
        <Row gutter={[24, 24]}>
          {/* 左侧区域：放三个单选控制组件 */}
          <Col xs={24} md={7}>
            <Space orientation="vertical" size="middle" style={{ width: '100%', borderRight: '1px solid #f0f0f0', paddingRight: 16 }}>
              <div>
                <div style={{ marginBottom: 6 }}><Text type="secondary" strong>区域模式</Text></div>
                <Radio.Group value={t1Mode} onChange={(e) => setT1Mode(e.target.value)} buttonStyle="solid" block>
                  <Radio.Button value="default">默认</Radio.Button>
                  <Radio.Button value="north">北方</Radio.Button>
                  <Radio.Button value="guangdong">粤语</Radio.Button>
                </Radio.Group>
              </div>
              <div>
                <div style={{ marginBottom: 6 }}><Text type="secondary" strong>我的性别</Text></div>
                <Radio.Group value={t1Sex} onChange={(e) => setT1Sex(e.target.value)} buttonStyle="solid" block>
                  <Radio.Button value={1}>男</Radio.Button>
                  <Radio.Button value={0}>女</Radio.Button>
                </Radio.Group>
              </div>
              <div>
                <div style={{ marginBottom: 6 }}><Text type="secondary" strong>称呼方式</Text></div>
                <Radio.Group value={t1Reverse} onChange={(e) => setT1Reverse(e.target.value)} buttonStyle="solid" block>
                  <Radio.Button value={false}>我称呼 TA</Radio.Button>
                  <Radio.Button value={true}>TA 称呼我</Radio.Button>
                </Radio.Group>
              </div>
            </Space>
          </Col>

          {/* 右侧区域：放输入框、10个等宽排在同一行的按钮以及结果 */}
          <Col xs={24} md={17}>
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <TextArea
                rows={3}
                value={t1Input}
                onChange={(e) => setT1Input(e.target.value)}
                placeholder="请使用下方的关系链组合，或者手动输入，称呼之间用'的'字分开..."
              />

              {/* 使用纯 Flexbox 强行维持 10 个按钮在同一行，且总宽度与 TextArea 贴合 */}
              <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                {[
                  { label: '父', value: '爸爸' }, { label: '母', value: '妈妈' },
                  { label: '夫', value: '老公' }, { label: '妻', value: '老婆' },
                  { label: '兄', value: '哥哥' }, { label: '弟', value: '弟弟' },
                  { label: '姐', value: '姐姐' }, { label: '妹', value: '妹妹' },
                  { label: '子', value: '儿子' }, { label: '女', value: '女儿' }
                ].map((btn) => (
                  <Button
                    key={btn.label}
                    style={{ flex: 1, padding: '0 4px', minWidth: 0, textAlign: 'center' }}
                    disabled={btn.label === t1DisabledKey}
                    onClick={() => handleT1BtnClick(btn.value)}
                  >
                    {btn.label}
                  </Button>
                ))}
              </div>

              <Row gutter={12}>
                <Col span={12}>
                  <Button block icon={<UndoOutlined />} danger ghost onClick={handleT1Back}>回退一步</Button>
                </Col>
                <Col span={12}>
                  <Button block icon={<DeleteOutlined />} danger onClick={() => { setT1Input(''); setT1Result(''); }}>清空输入</Button>
                </Col>
              </Row>

              <div>
                <div style={{ marginBottom: 6 }}><Text strong>计算结果：</Text></div>
                <TextArea rows={3} readOnly value={t1Result} style={{ backgroundColor: '#fcfcfc', color: '#1677ff', fontWeight: 'bold' }} />
              </div>
            </Space>
          </Col>
        </Row>
      ),
    },
    {
      key: '2',
      label: '称呼找关系',
      children: (
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <div style={{ marginBottom: 6 }}><Text type="secondary">输入已知称呼</Text></div>
            <Input
              size="large"
              placeholder="应用场景：七舅姥爷和我什么关系？侄子和外甥的区别在哪里？太外公和外太公有什么不同？"
              value={t2Input}
              onChange={(e) => setT2Input(e.target.value)}
              allowClear
            />
          </div>
          <div>
            <div style={{ marginBottom: 6 }}><Text strong>计算结果 (亲戚关系链)：</Text></div>
            <TextArea rows={3} readOnly value={t2Result} style={{ backgroundColor: '#fcfcfc', color: '#1677ff', fontWeight: 'bold' }} />
          </div>
        </Space>
      ),
    },
    {
      key: '3',
      label: '两者间称呼',
      children: (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Row justify="space-between" align="middle">
            <Text type="secondary">计算两个称呼彼此之间的叫法</Text>
            <Checkbox checked={t3Optimal} onChange={(e) => setT3Optimal(e.target.checked)}>最短关系模式</Checkbox>
          </Row>
          
          <Row gutter={12} align="middle">
            <Col xs={24} sm={7}>
              <div style={{ marginBottom: 6 }}><Text type="secondary">输入第一个称呼</Text></div>
              <Input
                size="large"
                placeholder="应用场景：外舅公是我妈的谁？"
                value={t3Person}
                onChange={(e) => setT3Person(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={7}>
              <div style={{ marginBottom: 6 }}><Text type="secondary">输入第二个称呼</Text></div>
              <Input
                size="large"
                placeholder="应用场景：我爸应该叫舅老爷什么？"
                value={t3Target}
                onChange={(e) => setT3Target(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={10}>
              <div style={{ marginBottom: 6 }}><Text type="secondary">称呼方式</Text></div>
              <Radio.Group value={t3Reverse} onChange={(e) => setT3Reverse(e.target.value)} buttonStyle="solid" size="large" block>
                <Radio.Button value={true}>前者称呼后者</Radio.Button>
                <Radio.Button value={false}>后者称呼前者</Radio.Button>
              </Radio.Group>
            </Col>
          </Row>

          <div>
            <div style={{ marginBottom: 6 }}><Text strong>计算结果：</Text></div>
            <TextArea rows={3} readOnly value={t3Result} style={{ backgroundColor: '#fcfcfc', color: '#1677ff', fontWeight: 'bold' }} />
          </div>
        </Space>
      ),
    },
    {
      key: '4',
      label: '两者的合称',
      children: (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Row justify="space-between" align="middle">
            <Text type="secondary">计算两位亲戚在家庭中的联合称呼</Text>
            <Checkbox checked={t4Optimal} onChange={(e) => setT4Optimal(e.target.checked)}>最短关系模式</Checkbox>
          </Row>

          <Row gutter={12} align="middle">
            <Col xs={24} sm={11}>
              <div style={{ marginBottom: 6 }}><Text type="secondary">输入第一个称呼</Text></div>
              <Input
                size="large"
                placeholder="应用场景：奶奶和外婆之间什么关系？"
                value={t4Person}
                onChange={(e) => setT4Person(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={2} style={{ textAlign: 'center', fontSize: 36, color: '#bfbfbf', fontWeight: 'bold', margin: '4px 0' }}>
              +
            </Col>
            <Col xs={24} sm={11}>
              <div style={{ marginBottom: 6 }}><Text type="secondary">输入第二个称呼</Text></div>
              <Input
                size="large"
                placeholder="应用场景：舅公和爷爷是什么关系？"
                value={t4Target}
                onChange={(e) => setT4Target(e.target.value)}
                allowClear
              />
            </Col>
          </Row>

          <div>
            <div style={{ marginBottom: 6 }}><Text strong>两者合称：</Text></div>
            <TextArea rows={3} readOnly value={t4Result} style={{ backgroundColor: '#fcfcfc', color: '#1677ff', fontWeight: 'bold' }} />
          </div>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '40px 20px', maxWidth: '1080px', margin: '0 auto' }}>
      <Card 
        style={{ 
          borderRadius: '16px', 
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.05)',
          border: '1px solid #f0f0f0'
        }}
      >
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <Title level={3}>
            中国亲戚关系计算器
          </Title>
        </div>
        <Tabs defaultActiveKey="1" items={items} type="line" size="large" centered />
      </Card>
    </div>
  );
}