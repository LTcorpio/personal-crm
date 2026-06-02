import json
import pandas as pd

# 读取JSON文件
# 假设您的JSON文件名为'data.json'
with open('data.json', 'r', encoding='utf-8') as file:
    data = json.load(file)

# 提取需要的字段
extracted_data = []
for item in data:
    extracted_item = {
        'id': item.get('id', ''),
        'name': item.get('name', ''),
        'birthDate': item.get('birthDate', '')
    }
    extracted_data.append(extracted_item)

# 转换为DataFrame
df = pd.DataFrame(extracted_data)

# 保存为Excel文件
df.to_excel('output.xlsx', index=False, engine='openpyxl')

print("Excel文件已生成：output.xlsx")