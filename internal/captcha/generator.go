package captcha

import (
	"crypto/rand"
	"encoding/json"
	"math/big"
	"sync"

	"github.com/golang/freetype/truetype"
	"github.com/wenlng/go-captcha-assets/bindata/chars"
	"github.com/wenlng/go-captcha-assets/resources/fonts/fzshengsksjw"
	"github.com/wenlng/go-captcha-assets/resources/imagesv2"
	"github.com/wenlng/go-captcha-assets/resources/shapes"
	"github.com/wenlng/go-captcha-assets/resources/tiles"
	"github.com/wenlng/go-captcha/v2/base/option"
	"github.com/wenlng/go-captcha/v2/click"
	"github.com/wenlng/go-captcha/v2/rotate"
	"github.com/wenlng/go-captcha/v2/slide"
)

// PublicData deliberately excludes solution coordinates, angles and target text.
type PublicData struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	Image      string `json:"image"`
	Thumb      string `json:"thumb"`
	TileWidth  int    `json:"tile_width,omitempty"`
	TileHeight int    `json:"tile_height,omitempty"`
	TileX      int    `json:"tile_x,omitempty"`
	TileY      int    `json:"tile_y,omitempty"`
	ThumbSize  int    `json:"thumb_size,omitempty"`
}
type Answer struct {
	Points []Point `json:"points"`
	X      int     `json:"x"`
	Y      int     `json:"y"`
	Angle  int     `json:"angle"`
}
type Point struct {
	X int `json:"x"`
	Y int `json:"y"`
}
type generators struct {
	mu     sync.Mutex
	clicks []click.Captcha
	slides []slide.Captcha
	rotate rotate.Captcha
}

var loadGenerators = sync.OnceValues(newGenerators)
var kinds = []string{"click_text", "click_alpha", "click_shape", "slide", "drag", "rotate"}

func newGenerators() (*generators, error) {
	imgs, err := imagesv2.GetImages()
	if err != nil {
		return nil, err
	}
	font, err := fzshengsksjw.GetFont()
	if err != nil {
		return nil, err
	}
	shapeMaps, err := shapes.GetShapes()
	if err != nil {
		return nil, err
	}
	graphs, err := tiles.GetTiles()
	if err != nil {
		return nil, err
	}
	g := &generators{}
	for _, letters := range [][]string{chars.GetChineseChars(), chars.GetAlphaChars()} {
		b := click.NewBuilder(click.WithRangeLen(option.RangeVal{Min: 4, Max: 6}), click.WithRangeVerifyLen(option.RangeVal{Min: 3, Max: 3}))
		b.SetResources(click.WithChars(letters), click.WithFonts([]*truetype.Font{font}), click.WithBackgrounds(imgs))
		g.clicks = append(g.clicks, b.Make())
	}
	b := click.NewBuilder(click.WithRangeLen(option.RangeVal{Min: 4, Max: 6}), click.WithRangeVerifyLen(option.RangeVal{Min: 3, Max: 3}), click.WithIsThumbNonDeformAbility(true))
	b.SetResources(click.WithShapes(shapeMaps), click.WithBackgrounds(imgs))
	g.clicks = append(g.clicks, b.MakeShape())
	tiles2 := make([]*slide.GraphImage, 0, len(graphs))
	for _, v := range graphs {
		tiles2 = append(tiles2, &slide.GraphImage{OverlayImage: v.OverlayImage, MaskImage: v.MaskImage, ShadowImage: v.ShadowImage})
	}
	sb := slide.NewBuilder()
	sb.SetResources(slide.WithGraphImages(tiles2), slide.WithBackgrounds(imgs))
	g.slides = append(g.slides, sb.Make())
	db := slide.NewBuilder(slide.WithGenGraphNumber(2), slide.WithEnableGraphVerticalRandom(true))
	db.SetResources(slide.WithGraphImages(tiles2), slide.WithBackgrounds(imgs))
	g.slides = append(g.slides, db.MakeDragDrop())
	rb := rotate.NewBuilder(rotate.WithRangeAnglePos([]option.RangeVal{{Min: 30, Max: 330}}))
	rb.SetResources(rotate.WithImages(imgs))
	g.rotate = rb.Make()
	return g, nil
}
func generate() (PublicData, json.RawMessage, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(len(kinds))))
	if err != nil {
		return PublicData{}, nil, err
	}
	return generateKind(int(n.Int64()))
}
func generateKind(index int) (PublicData, json.RawMessage, error) {
	g, err := loadGenerators()
	if err != nil {
		return PublicData{}, nil, err
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	out := PublicData{Kind: kinds[index]}
	var solution []byte
	switch {
	case index < 3:
		d, e := g.clicks[index].Generate()
		if e != nil {
			return out, nil, e
		}
		out.Image, err = d.GetMasterImage().ToBase64()
		if err != nil {
			return out, nil, err
		}
		out.Thumb, err = d.GetThumbImage().ToBase64()
		solution, _ = json.Marshal(d.GetData())
	case index < 5:
		d, e := g.slides[index-3].Generate()
		if e != nil {
			return out, nil, e
		}
		v := d.GetData()
		out.Image, err = d.GetMasterImage().ToBase64()
		if err != nil {
			return out, nil, err
		}
		out.Thumb, err = d.GetTileImage().ToBase64()
		out.TileWidth = v.Width
		out.TileHeight = v.Height
		out.TileX = v.DX
		out.TileY = v.DY
		solution, _ = json.Marshal(v)
	default:
		d, e := g.rotate.Generate()
		if e != nil {
			return out, nil, e
		}
		out.Image, err = d.GetMasterImage().ToBase64()
		if err != nil {
			return out, nil, err
		}
		out.Thumb, err = d.GetThumbImage().ToBase64()
		out.ThumbSize = d.GetData().Width
		solution, _ = json.Marshal(d.GetData())
	}
	return out, solution, err
}
func validate(kind string, raw json.RawMessage, a Answer) bool {
	switch kind {
	case "click_text", "click_alpha", "click_shape":
		var dots map[int]*click.Dot
		if json.Unmarshal(raw, &dots) != nil || len(a.Points) != len(dots) || len(dots) == 0 {
			return false
		}
		for i, p := range a.Points {
			d := dots[i]
			if d == nil || !click.Validate(p.X, p.Y, d.X, d.Y, d.Width, d.Height, 3) {
				return false
			}
		}
		return true
	case "slide", "drag":
		var d slide.Block
		if json.Unmarshal(raw, &d) != nil {
			return false
		}
		return slide.Validate(a.X, a.Y, d.X, d.Y, 5)
	case "rotate":
		var d rotate.Block
		if json.Unmarshal(raw, &d) != nil || a.Angle < 0 || a.Angle > 360 {
			return false
		}
		return rotate.Validate(a.Angle, d.Angle, 5)
	}
	return false
}
