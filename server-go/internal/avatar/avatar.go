// Package avatar 负责联系人头像的本地化文件存储。
//
// 存储约定（与数据库同盘同目录，便于外部备份服务整目录拷贝）：
//   - 文件统一落在 AVATAR_DIR（默认 $DB_DIR/avatars）；
//   - 文件名 = "<sha256 十六进制>.<扩展名>"，即「内容寻址」：
//     同一张图片无论被多少位联系人使用，磁盘上都只存在一份；
//   - 图片按原始字节落盘，不做压缩、裁剪或转码（保留最高画质）；
//   - 本包只负责单文件的写入/读取/删除，是否该删除由调用方按引用计数决定。
package avatar

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// ErrNotImage 表示待存储的内容不是受支持的位图格式。
var ErrNotImage = errors.New("不是受支持的图片格式（仅支持 JPEG / PNG / GIF / WebP / BMP）")

// extByMIME 仅收录各主流浏览器可直接渲染的位图格式。
// 刻意不收 SVG：SVG 可内嵌脚本，作为同源图片返回会带来 XSS 风险。
var extByMIME = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
	"image/webp": ".webp",
	"image/bmp":  ".bmp",
}

// Store 是一个目录级的头像文件仓库。
type Store struct {
	dir string
}

// NewStore 创建仓库并确保目录存在。
func NewStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Store{dir: dir}, nil
}

// Dir 返回头像目录路径。
func (s *Store) Dir() string { return s.dir }

// Path 返回某个文件名对应的磁盘路径。
// 文件名一律经 filepath.Base 收敛，杜绝 "../" 之类的目录穿越。
func (s *Store) Path(fileName string) string {
	return filepath.Join(s.dir, filepath.Base(fileName))
}

// SaveResult 描述一次落盘的结果。
type SaveResult struct {
	Hash     string // 图片内容的 SHA-256（小写十六进制）
	FileName string // 落盘文件名 "<hash><ext>"
	Existed  bool   // true 表示该内容此前已在库，本次未重复写入
}

// Save 按内容哈希落盘图片：若同内容的文件已存在则直接复用，实现「同一张图不重复存储」。
func (s *Store) Save(data []byte) (*SaveResult, error) {
	ext, ok := extByMIME[sniffMIME(data)]
	if !ok {
		return nil, ErrNotImage
	}

	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	fileName := hash + ext
	target := filepath.Join(s.dir, fileName)

	if info, err := os.Stat(target); err == nil && !info.IsDir() {
		return &SaveResult{Hash: hash, FileName: fileName, Existed: true}, nil
	}

	// 先写临时文件再原子重命名：避免写入中断留下半张图，
	// 也让并发写同一张图时后到的 rename 覆盖前一个（内容相同，结果一致）。
	tmp, err := os.CreateTemp(s.dir, ".tmp-avatar-*")
	if err != nil {
		return nil, err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return nil, err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return nil, err
	}
	if err := os.Rename(tmpName, target); err != nil {
		os.Remove(tmpName)
		return nil, err
	}
	return &SaveResult{Hash: hash, FileName: fileName}, nil
}

// Validate 只做格式校验、不落盘。
// 用于「方图 + 原图」一次上传两个文件时先统一校验，避免其中一个不合格却已把另一个写进磁盘。
func Validate(data []byte) error {
	if _, ok := extByMIME[sniffMIME(data)]; !ok {
		return ErrNotImage
	}
	return nil
}

// Delete 移除单个头像文件；文件本就不存在时视为成功。
func (s *Store) Delete(fileName string) error {
	if strings.TrimSpace(fileName) == "" {
		return nil
	}
	if err := os.Remove(s.Path(fileName)); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// CleanTempFiles 清理历史遗留的临时文件（进程被强杀时可能残留）。
func (s *Store) CleanTempFiles() {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".tmp-avatar-") {
			_ = os.Remove(filepath.Join(s.dir, entry.Name()))
		}
	}
}

// sniffMIME 通过文件头判定 MIME，不信任客户端声明的 Content-Type
// （避免把可执行内容伪装成图片存进来）。
func sniffMIME(data []byte) string {
	detected := http.DetectContentType(data)
	if i := strings.IndexByte(detected, ';'); i >= 0 {
		detected = strings.TrimSpace(detected[:i])
	}
	return detected
}
